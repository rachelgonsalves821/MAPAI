import docx
import io

def run():
    doc = docx.Document('mapai_brand_guide_v2.docx')
    text = '\n'.join([p.text for p in doc.paragraphs])
    with io.open('brand_guide_final.txt', 'w', encoding='utf-8') as f:
        f.write(text)

if __name__ == "__main__":
    run()
