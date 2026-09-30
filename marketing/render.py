"""Deterministic Voxelle motion film. Pillow + NumPy + bundled FFmpeg, no online rendering."""
from pathlib import Path
import argparse, bisect, functools, json, math, os, subprocess, sys, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'marketing/assets'
OUT = ROOT / 'marketing/output'
MUSIC = ROOT / 'marketing/audio/infected-mushroom-vibes.mp3'
FFMPEG = ROOT / 'node_modules/ffmpeg-static/ffmpeg.exe'
FPS = 30
DARK, DEEP, LIME, WARM, MUTED = '#11271e', '#091b13', '#c7f65b', '#f2f0e7', '#a4b9a8'
FONT_DIR = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts'
OUT.mkdir(parents=True, exist_ok=True)

@functools.lru_cache(maxsize=200)
def font(size, latin=False):
    return ImageFont.truetype(str(FONT_DIR / ('segoeuib.ttf' if latin else 'msyhbd.ttc')), size)

@functools.lru_cache(maxsize=500)
def label(text, size, color=WARM, latin=False):
    f = font(size, latin)
    box = f.getbbox(text)
    image = Image.new('RGBA', (max(1, box[2]-box[0]+4), box[3]-box[1]+8))
    ImageDraw.Draw(image).text((2-box[0], 2-box[1]), text, font=f, fill=color)
    return image

def text(image, value, xy, size, color=WARM, latin=False):
    layer = label(value, size, color, latin)
    image.paste(layer, tuple(map(round, xy)), layer)

def fit(image, size):
    return ImageOps.fit(image, size, method=Image.Resampling.LANCZOS)

def ease(v):
    return 1 - (1 - max(0, min(1, v))) ** 4

def analyze():
    wav = OUT / 'analysis.wav'
    subprocess.run([str(FFMPEG), '-hide_banner', '-loglevel', 'error', '-y', '-i', str(MUSIC), '-ac', '1', '-ar', '22050', str(wav)], check=True)
    with wave.open(str(wav), 'rb') as w:
        samples = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    hop, n = 256, 1024
    frames = np.lib.stride_tricks.sliding_window_view(samples, n)[::hop]
    spectrum = np.abs(np.fft.rfft(frames * np.hanning(n), axis=1))
    bass = np.sqrt(np.mean(spectrum[:, 2:15] ** 2, axis=1))
    flux = np.mean(np.maximum(np.diff(spectrum, axis=0, prepend=spectrum[:1]), 0), axis=1)
    onset = (bass / (np.max(bass) or 1) * .55 + flux / (np.max(flux) or 1) * .45)
    candidates = []
    for i in range(2, len(onset)-2):
        if onset[i] >= max(onset[i-2:i+3]) and onset[i] > np.quantile(onset, .65):
            t = i * hop / 22050
            if candidates and t - candidates[-1][0] < .22:
                if onset[i] > candidates[-1][1]: candidates[-1] = (t, float(onset[i]))
            else: candidates.append((t, float(onset[i])))
    main_nominal = [0, 4, 7.5, 12.5, 17.5, 22.5, 27, 31, 35.5, 40]
    social_nominal = [0, 2.2, 4.5, 7.7, 10.8, 12.8, 15]
    def snap(times):
        return [0] + [round(min((p for p in candidates if abs(p[0]-t)<.22), key=lambda p: abs(p[0]-t), default=(t,0))[0]*FPS)/FPS for t in times[1:-1]] + [times[-1]]
    main, social = snap(main_nominal), snap(social_nominal)
    rms = np.sqrt(np.mean(frames ** 2, axis=1))
    rms = rms / (np.quantile(rms, .98) or 1)
    doc = {'track': 'Infected Mushroom Vibes', 'artist': 'Alejandro Magaña (A. M.)', 'source': 'https://assets.mixkit.co/music/136/136.mp3', 'analysis': '22.05 kHz mono, 1024-sample Hann FFT, 256-sample hop; bass energy + positive spectral flux; cuts snapped within 220 ms to an onset and quantized to 30 fps', 'mainCuts': main, 'socialCuts': social, 'detectedOnsets': [round(t,3) for t,_ in candidates if t <= 40], 'mainAudioStart': 0, 'socialAudioStart': 0}
    (OUT / 'beat-analysis.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding='utf-8')
    return main, social, rms, hop

def prepare_assets():
    for name in ['brand-wave', 'app-import', 'app-queue']:
        img = Image.open(ASSETS / (name+'.png')).convert('RGB')
        if name=='brand-wave': img=img.resize((1280,720),Image.Resampling.LANCZOS)
        img.save(OUT / (name+'.webp'), quality=86)
    for name,width in [('brand-wave',800),('app-queue',720)]:
        img=Image.open(ASSETS/(name+'.png')).convert('RGB')
        img.resize((width,round(img.height*width/img.width)),Image.Resampling.LANCZOS).save(OUT/(name+'-mobile.webp'),quality=86)
    Image.open(ASSETS/'app-settings.png').crop((270,170,1390,940)).save(OUT/'settings-detail.webp', quality=90)
    transcript = Image.open(ASSETS/'app-transcript.png').crop((260,250,1180,750))
    transcript.save(OUT/'transcript-detail.webp', quality=92)
    shots = {
        'import': Image.open(ASSETS/'app-import.png').convert('RGB'),
        'files': Image.open(ASSETS/'app-files.png').crop((278,80,1383,415)).convert('RGB'),
        'link': Image.open(ASSETS/'app-queue.png').crop((278,92,1383,415)).convert('RGB'),
        'queue': Image.open(ASSETS/'app-queue.png').crop((278,434,1383,942)).convert('RGB'),
        'settings': Image.open(ASSETS/'app-settings.png').crop((278,176,1383,815)).convert('RGB'),
        'transcript': transcript.convert('RGB'),
    }
    for progress in [12,28,46,64,82,100]:
        shots[f'queue-{progress}']=Image.open(ASSETS/f'app-progress-{progress}.png').crop((278,434,1383,942)).convert('RGB')
    for mode in ['two','all']:
        shots['files-'+mode]=Image.open(ASSETS/f'app-files-{mode}.png').crop((278,80,1383,415)).convert('RGB')
    return shots

def screen(image, source, box, p=1):
    x,y,w,h = box
    source = ImageOps.contain(source, (w,h), method=Image.Resampling.LANCZOS)
    x += (w-source.width)//2
    y += (h-source.height)//2 + round((1-ease(p))*65)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((x-3,y-3,x+source.width+3,y+source.height+3), radius=10, fill='#688467')
    image.paste(source,(x,y))

def waveform(image, t, energy, y, width, x, vertical=False, color=LIME):
    draw = ImageDraw.Draw(image)
    count = 110 if not vertical else 65
    gap = width/count
    for i in range(count):
        envelope = math.sin(math.pi*i/count)**.5
        amount = abs(math.sin(i*.59+t*4)*math.cos(i*.17-t*2))
        h = (10+amount*110*(.35+energy)*envelope)
        draw.rounded_rectangle((x+i*gap,y-h/2,x+i*gap+max(3,gap*.35),y+h/2), radius=2, fill=color)

MAIN = [
    ('REPLAY. AGAIN?', ['好内容，','不该只留在视频里。'], '课上讲过什么？访谈的重点在哪里？'),
    ('VOICE INTO WORDS', ['把声音，','变成文字。'], 'Voxelle · 视频转文字'),
    ('IMPORT', ['一个文件。','或一组链接。'], '本地视频 / 音频 / 文件夹 / 公开视频链接'),
    ('SUBTITLES FIRST', ['有字幕，先用字幕。'], '人工字幕 → 自动字幕 → 没有字幕时调用 ASR'),
    ('KEEP TRACK', ['每一步，都看得见。'], '任务阶段 · 切片进度 · 批次汇总'),
    ('YOUR FORMAT', ['只导出，你需要的。'], 'TXT / SRT / VTT · 每批自由勾选'),
    ('YOUR MODEL', ['多套模型，随时切换。'], 'Groq · Deepgram · OpenAI · 自定义兼容接口'),
    ('TAKE THE WORDS', ['找到重点。直接复制。'], 'TXT 预览 · 部分选择 · 复制全文'),
    ('VOXELLE FOR WINDOWS', ['Voxelle'], '让声音留下文字。'),
]
SOCIAL = [
    ('REPLAY. AGAIN?', ['好内容，','值得留下。'], '从视频，到可查找的文字'),
    ('VOICE INTO WORDS', ['把声音，','变成文字。'], 'Voxelle'),
    ('IMPORT & TRANSCRIBE', ['文件或链接，','一次导入。'], '字幕优先 · 必要时调用 ASR'),
    ('YOUR WORKSPACE', ['进度看得见。','格式自己选。'], 'TXT · SRT · VTT'),
    ('TAKE THE WORDS', ['找到重点。','直接复制。'], '应用内预览与复制 TXT'),
    ('VOXELLE FOR WINDOWS', ['Voxelle'], '让声音留下文字。'),
]

class Film:
    def __init__(self, vertical, cuts, rms, hop, shots):
        self.vertical, self.cuts, self.rms, self.hop, self.shots = vertical,cuts,rms,hop,shots
        self.w,self.h = (1080,1920) if vertical else (1920,1080)
        self.background = fit(Image.open(ASSETS/'brand-wave.png').convert('RGB'), (self.w,self.h))
        self.data = SOCIAL if vertical else MAIN
        self.scaled = {}
    def shot(self,name,w,h):
        key=name,w,h
        if key not in self.scaled: self.scaled[key]=ImageOps.contain(self.shots[name],(w,h),method=Image.Resampling.LANCZOS)
        return self.scaled[key]
    def frame(self,t):
        s = min(len(self.data)-1,bisect.bisect_right(self.cuts,t)-1)
        local=t-self.cuts[s]
        duration=self.cuts[s+1]-self.cuts[s]
        p=local/.65
        energy=float(self.rms[min(len(self.rms)-1,round(t*22050/self.hop))])
        w,h=self.w,self.h
        warm = not self.vertical and s==5
        bg,fg = (WARM,DARK) if warm else (DARK,WARM)
        im=Image.new('RGB',(w,h),bg)
        draw=ImageDraw.Draw(im)
        if s in (1,len(self.data)-1):
            im=self.background.copy()
            overlay=Image.new('RGB',(w,h),DARK)
            im=Image.blend(im,overlay,.24)
            draw=ImageDraw.Draw(im)
        margin=86 if self.vertical else 100
        top=156 if self.vertical else 72
        text(im,'Voxelle', (margin,top), 39 if self.vertical else 30, DARK if warm else LIME,True)
        text(im,'VIDEO TO TEXT', (w-margin-255 if self.vertical else w-margin-218,top+10), 23 if self.vertical else 21,MUTED,True)
        draw.line((margin,top+72,w-margin,top+72),fill='#57705a',width=1)
        tag, lines, sub = self.data[s]
        if self.vertical:
            text(im,tag,(margin,330),24,LIME,True)
            headline_y=410+round((1-ease(p))*75)
            for i,line in enumerate(lines):
                size=153 if line=='Voxelle' else 103
                text(im,line,(margin,headline_y+i*145),size,LIME if i==len(lines)-1 else WARM,line=='Voxelle')
            sub_y=headline_y+len(lines)*145+26
            text(im,sub,(margin,sub_y),31,MUTED)
            if s in (0,1,5):
                waveform(im,t,energy,1190,900,90,True)
                if s==0:
                    for i,word in enumerate(['课程','访谈','灵感']): text(im,word,(90+i*300,990),58,WARM)
                if s==5:
                    draw.rounded_rectangle((86,1340,994,1460),radius=9,fill=LIME)
                    text(im,'下载 Windows 版',(145,1372),48,DARK)
                    text(im,'云端转写需自备 API Key',(86,1540),29,MUTED)
            else:
                name={2:'files',3:'queue',4:'transcript'}[s]
                if s==3: name='queue-'+str([12,28,46,64,82,100][min(5,round(local/duration*5))])
                src=self.shot(name,908,670)
                screen(im,src,(86,930,908,670),p)
                text(im,'真实软件界面 · 演示数据',(86,1640),25,MUTED)
        else:
            text(im,tag,(margin,208),23,LIME if not warm else '#638139',True)
            if s in (0,1,8):
                hy=292+round((1-ease(p))*70)
                for i,line in enumerate(lines):
                    size=220 if line=='Voxelle' else (135 if len(line)<=6 else 98)
                    text(im,line,(margin,hy+i*165),size,LIME if i==len(lines)-1 else WARM,line=='Voxelle')
                text(im,sub,(margin,hy+len(lines)*165+26),35,MUTED)
                waveform(im,t,energy,858,1710,100)
                if s==0:
                    # A moving editorial time ruler evokes replay, without implying an app feature.
                    for i in range(23):
                        x=100+i*78
                        draw.line((x,755,x,776+(i%4==0)*16),fill='#668273',width=2)
                    draw.line((100+local/4*1680,738,100+local/4*1680,810),fill=LIME,width=4)
                if s==8:
                    draw.rounded_rectangle((1060,382,1740,484),radius=8,fill=LIME)
                    text(im,'下载 Windows 版',(1100,410),38,DARK)
                    text(im,'云端转写需自备 API Key',(1060,515),23,MUTED)
            else:
                hy=268+round((1-ease(p))*55)
                for i,line in enumerate(lines): text(im,line,(margin,hy+i*125),95,fg)
                if s==2:
                    text(im,'本地视频 / 音频 / 文件夹',(margin,hy+270),27,MUTED)
                    text(im,'YouTube / 哔哩哔哩公开链接',(margin,hy+320),27,MUTED)
                    source=self.shot('import',1070,750)
                    screen(im,source,(760,260,1070,750),p)
                else:
                    text(im,sub,(margin,hy+132),29,'#6b7d60' if warm else MUTED)
                    name={3:'link',4:'queue',5:'files',6:'settings',7:'transcript'}[s]
                    if s==4: name='queue-'+str([12,28,46,64,82,100][min(5,round(local/duration*5))])
                    if s==5: name='files' if local/duration<.33 else 'files-two' if local/duration<.66 else 'files-all'
                    src=self.shot(name,1550,500)
                    screen(im,src,(185,505+round(math.sin(local*1.1)*5),1550,500),p)
                    text(im,'真实软件界面 · 演示数据',(100,1022),18,'#6b7d60' if warm else MUTED)
                    # An editorial accent follows the music without changing the captured UI.
                    sweep = round(1580*min(1,local/1.4))
                    draw.line((100,466,100+sweep,466),fill='#7a983e' if warm else LIME,width=3)
        # A thin beat-responsive edge, never full-frame flashes.
        draw=ImageDraw.Draw(im)
        edge=round(3+energy*4)
        draw.rectangle((0,h-edge,w,h),fill=LIME)
        text(im, f'{s+1:02d} / {len(self.data):02d}',(w-margin-135,h-80),22,'#79907c',True)
        # Enter on the selected drum onset with a 7-frame directional reveal.
        if 0 < local < 7/FPS and s>0:
            cover=round(w*(1-ease(local/(7/FPS))))
            if cover>0: draw.rectangle((w-cover,0,w,h),fill=LIME if s==1 else DEEP)
        return im

def render(film,name,duration,postertime):
    target=OUT/(name+'.mp4')
    command=[str(FFMPEG),'-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{film.w}x{film.h}','-r',str(FPS),'-i','pipe:0','-i',str(MUSIC),'-map','0:v','-map','1:a','-t',str(duration),'-c:v','libx264','-preset','fast','-crf','20','-threads','4','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-af',f'loudnorm=I=-16:TP=-1.5:LRA=8,afade=t=in:d=0.12,afade=t=out:st={duration-.7}:d=0.7','-movflags','+faststart',str(target)]
    with (OUT/(name+'.render.log')).open('w') as log:
        proc=subprocess.Popen(command,stdin=subprocess.PIPE,stderr=log)
        try:
            for i in range(round(duration*FPS)):
                proc.stdin.write(film.frame(i/FPS).tobytes())
                if i%150==0: print(f'{name}: {i/FPS:.0f}/{duration}s',flush=True)
            proc.stdin.close()
            if proc.wait()!=0: raise RuntimeError('FFmpeg failed; see render log')
        except BaseException:
            proc.kill(); proc.wait(); raise
    film.frame(postertime).save(OUT/('poster-social.jpg' if film.vertical else 'poster-main.jpg'),quality=95)
    print(f'Finished {target}',flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--assets-only',action='store_true')
    parser.add_argument('--stills',action='store_true')
    args=parser.parse_args()
    shots=prepare_assets()
    if args.assets_only: sys.exit(0)
    main,social,rms,hop=analyze()
    films=[(Film(False,main,rms,hop,shots),'voxelle-main',40,37),(Film(True,social,rms,hop,shots),'voxelle-social',15,13.8)]
    for film,name,duration,poster in films:
        if args.stills:
            times=[(a+b)/2 for a,b in zip(film.cuts[:-1],film.cuts[1:])]
            for n,t in enumerate(times): film.frame(t).save(OUT/f'{name}-scene-{n+1}.jpg',quality=90)
        else: render(film,name,duration,poster)
