"""Generate deterministic code-native application icons; no personal imagery."""
from pathlib import Path
from PIL import Image, ImageDraw

directory=Path('src-tauri/icons')
directory.mkdir(parents=True,exist_ok=True)
image=Image.new('RGBA',(1024,1024),(0,0,0,0))
draw=ImageDraw.Draw(image)
draw.rounded_rectangle((32,32,992,992),radius=210,fill='#0c6048')
for points in [[(240,370),(512,210),(784,370),(512,530),(240,370)],[(240,512),(512,672),(784,512)],[(240,664),(512,824),(784,664)]]:
    draw.line(points,fill='white',width=44,joint='curve')
for name,size in [('32x32.png',32),('128x128.png',128),('128x128@2x.png',256)]:
    image.resize((size,size),Image.Resampling.LANCZOS).save(directory/name)
image.save(directory/'icon.icns',format='ICNS')
