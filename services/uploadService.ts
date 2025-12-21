
const API_URL = 'https://pro.filma4.ru/api/upload';
const API_KEY = 'cec481f50361daa41f728e47a28dda963bf5052206438d747fdcb320fe3c14d6';

/**
 * Загружает файл на сервер pro.filma4.ru
 * @param file Объект файла (Image)
 * @param folder Папка на сервере (например, 'recipes', 'wastage')
 * @returns Промис с URL загруженного файла
 */
export const uploadImage = async (file: File, folder: string = 'general'): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder); // Передаем имя папки

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'X-API-Key': API_KEY
            },
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Ошибка при загрузке файла');
        }

        const result = await response.json();
        
        if (result.success && result.data && result.data.url) {
            return result.data.url;
        } else {
            throw new Error('Некорректный ответ сервера');
        }
    } catch (error) {
        console.error('Upload error:', error);
        throw error;
    }
};
