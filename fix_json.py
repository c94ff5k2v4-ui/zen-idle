import json
import re

# 讀取原本的題庫
with open('questions.json', 'r', encoding='utf-8') as f:
    content = f.read()

# 使用正則表達式將錯誤的 text 替換掉
# 這裡把 textkg 換成 kg，textN 換成 N 等
content_fixed = content.replace('textkg', 'kg') \
                       .replace('textN', 'N') \
                       .replace('textm/s^2', 'm/s²') \
                       .replace('textm', 'm') \
                       .replace('texts', 's')

# 寫回新的或覆蓋原本的檔案
with open('questions_fixed.json', 'w', encoding='utf-8') as f:
    f.write(content_fixed)

print("✅ 題庫修正完畢！")
