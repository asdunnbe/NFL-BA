import os
import open3d as o3d

root = '/Users/asdunnbe/Documents/GitHub/NFL-BA/point_clouds/gt'

for file in os.listdir(root):
    print(file)

    plydata = o3d.io.read_point_cloud(os.path.join(root, file))
    o3d.io.write_point_cloud(os.path.join(root, 'ascii-'+file), plydata, write_ascii=True)
