import os
from PIL import Image

# Папка с вашими огромными оригиналами
input_folder = 'public/cards' 
# Папка, куда сохранятся легкие карты (скрипт создаст её сам)
output_folder = 'public/cards_compressed'

# Желаемая ширина карты (300px - идеальный баланс качества и веса для веба)
TARGET_WIDTH = 200

if not os.path.exists(output_folder):
    os.makedirs(output_folder)

print("Начинаю сжатие карт... 🚀")

processed = 0
saved_size = 0

for filename in os.listdir(input_folder):
    if filename.lower().endswith('.png'):
        img_path = os.path.join(input_folder, filename)
        
        # Узнаем начальный размер файла
        original_size = os.path.getsize(img_path)
        
        with Image.open(img_path) as img:
            # Если у карты прозрачные углы, нам нужно сохранить канал прозрачности (RGBA)
            if img.mode != 'RGBA':
                img = img.convert('RGBA')

            # Высчитываем новую высоту, чтобы не исказить пропорции
            w_percent = (TARGET_WIDTH / float(img.size[0]))
            h_size = int((float(img.size[1]) * float(w_percent)))
            
            # Сжимаем картинку с помощью лучшего алгоритма сглаживания (LANCZOS)
            img = img.resize((TARGET_WIDTH, h_size), Image.Resampling.LANCZOS)
            
            # Сохраняем в новую папку (включаем максимальную оптимизацию PNG)
            output_path = os.path.join(output_folder, filename)
            img.save(output_path, 'PNG', optimize=True)
            
            new_size = os.path.getsize(output_path)
            saved_size += (original_size - new_size)
            processed += 1
            
            print(f"✅ {filename}: {original_size // 1024} KB -> {new_size // 1024} KB")

print("-" * 30)
print(f"🎉 Готово! Обработано карт: {processed}")
print(f"📉 Вы сэкономили: {saved_size // (1024 * 1024)} Мегабайт!")