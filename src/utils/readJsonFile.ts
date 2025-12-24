import { promises as fs } from 'fs';
import path from 'path';

export async function readJsonFile(): Promise<any> {
  try {
    const filePath = path.join(process.cwd(), 'countries+states+cities.json');
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading or parsing JSON file:', err);
    throw err;
  }
}
