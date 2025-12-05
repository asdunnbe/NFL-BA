#
# Copyright (C) 2023, Inria
# GRAPHDECO research group, https://team.inria.fr/graphdeco
# All rights reserved.
#
# This software is free for non-commercial, research and evaluation use
# under the terms of the LICENSE.md file.
#
# For inquiries contact  george.drettakis@inria.fr
#

import math

import torch
from diff_gaussian_rasterization import (
    GaussianRasterizationSettings,
    GaussianRasterizer,
)

import torch.nn.functional as func
from gaussian_splatting.scene.gaussian_model import GaussianModel
from gaussian_splatting.utils.sh_utils import eval_sh

def get_normals(positions, scaling, rotations, camera_center=None):
    """
    if camera_center is given, the function will output a normal
    heading towards the camera center and not the opposite
    """
    def build_rotation(q):
        # norm = func.normalize(q, dim=-1)
        rot = torch.zeros((q.size(0), 3, 3), device='cuda')
        r = q[:, 0]
        x = q[:, 1]
        y = q[:, 2]
        z = q[:, 3]

        rot[:, 0, 0] = 1 - 2 * (y * y + z * z)
        rot[:, 0, 1] = 2 * (x * y - r * z)
        rot[:, 0, 2] = 2 * (x * z + r * y)
        rot[:, 1, 0] = 2 * (x * y + r * z)
        rot[:, 1, 1] = 1 - 2 * (x * x + z * z)
        rot[:, 1, 2] = 2 * (y * z - r * x)
        rot[:, 2, 0] = 2 * (x * z - r * y)
        rot[:, 2, 1] = 2 * (y * z + r * x)
        rot[:, 2, 2] = 1 - 2 * (x * x + y * y)

        return rot
    
    rotations = build_rotation(rotations) # quaternions to matrices
    axis = torch.argmin(scaling, dim=-1, keepdims=True) # [N, 1]
    axis = axis.unsqueeze(1).expand(-1, 3, -1) # [N, 3, 1]
    normals = rotations.gather(2, axis).squeeze(-1)

    if camera_center is None:
        camera_center = 0.

    center_to_camera = camera_center - positions
    normal_signs = (normals * center_to_camera).sum(dim=-1) > 0
    normal_signs = normal_signs * 2 - 1
    normals *= normal_signs.reshape(-1, 1)

    return normals


def render(
    viewpoint_camera,
    pc: GaussianModel,
    pipe,
    bg_color: torch.Tensor,
    scaling_modifier=1.0,
    override_color=None,
    mask=None
    ):
    """
    Render the scene.

    Background tensor (bg_color) must be on GPU!
    """

    # Create zero tensor. We will use it to make pytorch return gradients of the 2D (screen-space) means
    if pc.get_xyz.shape[0] == 0:
        return None

    screenspace_points = (
        torch.zeros_like(
            pc.get_xyz, dtype=pc.get_xyz.dtype, requires_grad=True, device="cuda"
        )
        + 0
    )
    try:
        screenspace_points.retain_grad()
    except Exception:
        pass

    # Set up rasterization configuration
    tanfovx = math.tan(viewpoint_camera.FoVx * 0.5)
    tanfovy = math.tan(viewpoint_camera.FoVy * 0.5)

    raster_settings = GaussianRasterizationSettings(
        image_height=int(viewpoint_camera.image_height),
        image_width=int(viewpoint_camera.image_width),
        tanfovx=tanfovx,
        tanfovy=tanfovy,
        bg=bg_color,
        scale_modifier=scaling_modifier,
        viewmatrix=viewpoint_camera.world_view_transform,
        projmatrix=viewpoint_camera.full_proj_transform,
        projmatrix_raw=viewpoint_camera.projection_matrix,
        sh_degree=pc.active_sh_degree,
        campos=viewpoint_camera.camera_center,
        prefiltered=False,
        debug=False,
    )

    rasterizer = GaussianRasterizer(raster_settings=raster_settings)

    means3D = pc.get_xyz
    means2D = screenspace_points
    opacity = pc.get_opacity

    # If precomputed 3d covariance is provided, use it. If not, then it will be computed from
    # scaling / rotation by the rasterizer.
    scales = None
    rotations = None
    cov3D_precomp = None
    if pipe.compute_cov3D_python:
        cov3D_precomp = pc.get_covariance(scaling_modifier)
    else:
        # check if the covariance is isotropic
        if pc.get_scaling.shape[-1] == 1:
            scales = pc.get_scaling.repeat(1, 3)
        else:
            scales = pc.get_scaling
        rotations = pc.get_rotation

    # If precomputed colors are provided, use them. Otherwise, if it is desired to precompute colors
    # from SHs in Python, do it. If not, then SH -> RGB conversion will be done by rasterizer.
    shs = None
    colors_precomp = None
    if colors_precomp is None:
        if pipe.convert_SHs_python:
            shs_view = pc.get_features.transpose(1, 2).view(
                -1, 3, (pc.max_sh_degree + 1) ** 2
            )
            dir_pp = pc.get_xyz - viewpoint_camera.camera_center.repeat(
                pc.get_features.shape[0], 1
            )
            dir_pp_normalized = dir_pp / dir_pp.norm(dim=1, keepdim=True)
            sh2rgb = eval_sh(pc.active_sh_degree, shs_view, dir_pp_normalized)
            colors_precomp = torch.clamp_min(sh2rgb + 0.5, 0.0)
        else:
            shs = pc.get_features
    else:
        colors_precomp = override_color

    normals = get_normals(means3D, scales, rotations)

    if pipe.nfl:
        print("Render NFL")
        attenuation = 0.0  # 0.5 then 1.0 then 0.25 then 0.75
        distance2 = means3D.square().sum(dim=-1, keepdim=True).clamp(min=1e-4)
        Ld = - means3D / distance2.sqrt()
        La = (Ld[..., 2:3] ** attenuation) / distance2
        cos = (Ld * normals).sum(dim=-1, keepdim=True).clamp(-1, 1)
        # w = F.softplus(params['specularity'])
        # shading = La * (cos * w[..., :1]
        #                 + (cos ** F.softplus(params['shininess']+1)) * w[..., 1:])
        shading = La * cos
        # print('shading', shading.min(), shading.max())
        shading = torch.pow(shading, 1/2.2)
    else:
        shading = torch.ones_like(means3D[..., 0:1], device=means3D.device)

    if colors_precomp is not None: print("Rendering with colors_precomp")
    # Rasterize visible Gaussians to image, obtain their radii (on screen).
    if mask is not None:
        rendered_image, radii, depth, opacity = rasterizer(
            means3D=means3D[mask],
            means2D=means2D[mask],
            shs=shs[mask],
            colors_precomp=colors_precomp[mask]* shading[mask] if colors_precomp is not None else None,
            # colors_precomp=colors_precomp[mask] if colors_precomp is not None else None,
            opacities=opacity[mask],
            scales=scales[mask],
            rotations=rotations[mask],
            cov3D_precomp=cov3D_precomp[mask] if cov3D_precomp is not None else None,
            theta=viewpoint_camera.cam_rot_delta,
            rho=viewpoint_camera.cam_trans_delta,
        )
    else:
        rendered_image, radii, depth, opacity, n_touched = rasterizer(
            means3D=means3D,
            means2D=means2D,
            shs=shs,
            # colors_precomp=colors_precomp,
            colors_precomp=colors_precomp * shading if colors_precomp is not None else None,
            opacities=opacity,
            scales=scales,
            rotations=rotations,
            cov3D_precomp=cov3D_precomp,
            theta=viewpoint_camera.cam_rot_delta,
            rho=viewpoint_camera.cam_trans_delta,
        )

    rendered_image = rendered_image.clamp(0.0, 1.0)

    # Those Gaussians that were frustum culled or had a radius of 0 were not visible.
    # They will be excluded from value updates used in the splitting criteria.
    return {
        "render": rendered_image,
        "viewspace_points": screenspace_points,
        "visibility_filter": radii > 0,
        "radii": radii,
        "depth": depth,
        "opacity": opacity,
        "n_touched": n_touched,
    }
