# NFL-BA: Near-Field Light Bundle Adjustment for SLAM in Dynamic Lighting

This repository contains the reference implementation of **NFL-BA** (Near-Field Light Bundle Adjustment). 

NFL-BA is implemented as a **plug-and-play** photometric optimization module, and in this repo we demonstrate it on top of the **MonoGS** SLAM / reconstruction backbone. 

The idea from this paper (correcting the image formulation model and bundle adjustment) works on multiple different backbones

## Overview

- **Backbone**: MonoGS (monocular Gaussian splatting SLAM / reconstruction).
- **Approach**: Plug-and-play near-field lighting bundle adjustment:
  - We keep the overall MonoGS pipeline intact.
  - We introduce a physically motivated near-field lighting model into the renderer and loss.
- **Main code changes**:
  - **Renderer**:
    - Extensions to the rendering code to model near-field illumination (e.g., inverse-square falloff, angle-dependent terms).
  - **Loss functions**:
    - Modifications to incorporate the near-field photometric residuals into the optimization.
- **Other changes**:
  - Minor changes to the CUDA rasterizer.
  - Minor adjustments in configuration files and experiment scripts to enable NFL-BA.

## Environment Setup

The environment and dependencies are intended to be **identical or very close to the original MonoGS implementation**.

```bash
conda env create -f environment.yml
conda activate MonoGS

pip install -e submodules/diff-gaussian-rasterization
```

Use the same Python version, CUDA / PyTorch versions, and compilation steps recommended by MonoGS.

## Running NFL-BA

Below are example commands for reproducing experiments on C3VD and on self-captured data. Adjust paths as needed.

### C3VD (Colonoscopy) Data

```bash
python slam.py \
    --config configs/mono/c3vd/base_config.yaml \
    --experiment c3vd \
    --depth c3vd \
    --scene /path/to/C3VD/cecum_t1_a_under_review
```

Key arguments:

- `--config`: Base configuration file for MonoGS + NFL-BA on C3VD.
- `--experiment`: Experiment tag (`c3vd` in our setup).
- `--depth`: Depth mode (`c3vd` uses the dataset depth maps, while `pps` uses depth predicted by PPSNet).
- `--scene`: Path to the specific C3VD sequence.

---

### Self-Captured Data

For our own self-captured sequences (e.g., pooled data from real-world scenes), we use:

```bash
python slam.py \
    --config configs/rgbd/wild/base_config.yaml \
    --experiment wild \
    --scene /path/to/data/pool_ON
```

Again, you should adapt:

- `--config` to match your configuration for self-captured RGBD or monocular data.
- `--scene` to the directory containing your sequence.



## Citation

If you find this code useful in your research, please cite:

```bibtex
@inproceedings{NFL-BA,
  title={NFL-BA: Near-Field Light Bundle Adjustment for SLAM in Dynamic Lighting},
  author={Dunn Beltran, Andrea and Rho, Daniel and Niethammer, Marc and Sengupta, Roni},
  journal={arXiv preprint arXiv:2412.13176},
  year={2024}
}
```


## Acknowledgements

- This codebase is built on top of **MonoGS**, and we are grateful to the original authors for releasing their implementation.
- Please also cite the MonoGS paper and repository if you build on this work.


## To-Do List

- [x] Release per-scene training / reconstruction code used in the paper.
- [ ] Release self-captured data 
- [ ] Release evaluation scripts for pose and reconstruction metrics.

