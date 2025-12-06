import fs from 'fs';
import path from 'path';

// Read update file (default update.xml)
const updateFile = 'update.xml';

if (!fs.existsSync(updateFile)) {
    console.error(`❌ Файл ${updateFile} не найден! \n1. Создайте файл update.xml в корне проекта.\n2. Вставьте туда XML-код из ответа ИИ.\n3. Запустите этот скрипт снова.`);
    process.exit(1);
}

const content = fs.readFileSync(updateFile, 'utf8');

// Regex to find changes
const regex = /<change>[\s\S]*?<file>(.*?)<\/file>[\s\S]*?<content><!\[CDATA\[([\s\S]*?)\]\]><\/content>[\s\S]*?<\/change>/g;

let match;
let count = 0;

while ((match = regex.exec(content)) !== null) {
    const filePath = match[1].trim();
    const fileContent = match[2];
    
    // Create directories if not exist
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Write file
    fs.writeFileSync(filePath, fileContent);
    console.log(`✅ Обновлен: ${filePath}`);
    count++;
}

if (count === 0) {
    console.log("⚠️ Изменений не найдено. Убедитесь, что вы скопировали XML блок полностью (от <changes> до </changes>).");
} else {
    console.log(`🎉 Успешно обновлено файлов: ${count}`);
    console.log(`👉 Теперь выполните: git add . && git commit -m "AI Update" && git push`);
}
