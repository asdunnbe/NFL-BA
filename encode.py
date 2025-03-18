import os

ROOT = '/Users/asdunnbe/Documents/GitHub/NFL-BA/videos'
ROOT_SAVE = '/Users/asdunnbe/Documents/GitHub/NFL-BA/videos-encoded'

os.makedirs(ROOT_SAVE, exist_ok=True)
for folder in os.listdir(ROOT):
    os.makedirs(os.path.join(ROOT_SAVE, folder), exist_ok=True)
    for file in os.listdir(os.path.join(ROOT, folder)):
        input = os.path.join(ROOT, folder, file)
        output = os.path.join(ROOT_SAVE, folder, file)

        if 'mp4' not in file: continue

        try:
            command = f'ffmpeg -y -i {input} \
                -c:v libx264 -profile:v baseline -level 3.0 \
                -pix_fmt yuv420p -movflags +faststart -an {output}'
            os.system(command)

        except:
            print('FAIL:', file)