"""Independent PDF raster QA. Requires pymupdf, numpy, scipy, pillow.
Original personal PDFs remain outside the application root.
"""
import os, json, hashlib
from pathlib import Path
import fitz
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import maximum_filter
root=Path.cwd(); out=root/'test-output/integration-020'; private=root.parent/'private-verification'
cases=[('A1_baseline',root/'public/models/ALLEGATO_A1_PEI_INFANZIA.pdf',out/'A1-canonical.pdf'),('Roma_baseline',root/'Motore-OCR-CTE-v1.0-INTEGRATION/fixtures/PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf',out/'Roma-canonical.pdf')]
if os.getenv('PEI_REAL_PDF_DIR'):
 originals=Path(os.environ['PEI_REAL_PDF_DIR'])
 cases += [('PDF_nativo_allegato',originals/'ALLEGATO A1_PEI_INFANZIA[617] 2.pdf',private/'native-canonical.pdf'),('PDF_compilato_allegato',originals/'ALLEGATO_A1_PEI_INFANZIA[2387] NUOVO PEI DI R.M.T 2.pdf',private/'filled-canonical.pdf')]
report={'method':'1000 px width; aspect fit; dark source pixels <150; target <200; neighborhood 2 px. Measures raster preservation, not OCR/field accuracy.','cases':[]}
def raster(page):
 p=page.get_pixmap(matrix=fitz.Matrix(1000/page.rect.width,1000/page.rect.width),alpha=False)
 return Image.frombytes('RGB',[p.width,p.height],p.samples)
for label,src,dst in cases:
 a,b=fitz.open(src),fitz.open(dst);assert len(a)==len(b)
 pages=[]
 for i in range(len(a)):
  original,target=raster(a[i]),raster(b[i]); ratio=min(target.width/original.width,target.height/original.height)
  w,h=round(original.width*ratio),round(original.height*ratio);expected=Image.new('RGB',target.size,'white');expected.paste(original.resize((w,h),Image.Resampling.LANCZOS),((target.width-w)//2,(target.height-h)//2))
  ink=np.asarray(expected).mean(2)<150;actual=np.asarray(target).mean(2)<200;near=maximum_filter(actual,size=5);count=int(ink.sum());missing=int((ink&~near).sum())
  fraction=missing/max(1,count);assert count>1000 and actual.sum()>1000;assert fraction<.02,(label,i+1,fraction)
  pages.append({'page':i+1,'widthPt':b[i].rect.width,'heightPt':b[i].rect.height,'sourceInkPixels':count,'missingFraction':fraction,'targetInkPixels':int(actual.sum())})
  if i in [0,2] and label in ['A1_baseline','Roma_baseline']:
   key='A1' if label.startswith('A1') else 'Roma';expected.save(out/f'{key}-original-page{i+1}.png');target.save(out/f'{key}-export-page{i+1}.png')
   combined=Image.new('RGB',(target.width*2,target.height+40),'white');combined.paste(expected,(0,40));combined.paste(target,(target.width,40));draw=ImageDraw.Draw(combined);draw.text((15,10),'Originale adattato A4',fill='black');draw.text((target.width+15,10),'PDF canonico riaperto',fill='black');combined.save(out/f'{key}-comparison-page{i+1}.png')
 report['cases'].append({'case':label,'pages':pages,'sourceHash':hashlib.sha256(src.read_bytes()).hexdigest(),'canonicalHash':hashlib.sha256(dst.read_bytes()).hexdigest(),'maxMissingFraction':max(p['missingFraction'] for p in pages)})
report['totalPages']=sum(len(c['pages']) for c in report['cases']);(out/'independent-render-report.json').write_text(json.dumps(report,indent=2));print(json.dumps({'pages':report['totalPages'],'maxMissingFraction':max(c['maxMissingFraction'] for c in report['cases'])}))
