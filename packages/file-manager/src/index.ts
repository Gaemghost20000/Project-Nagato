import express, { Request, Response } from 'express';

const app = express();
const PORT = process.env.FILE_MANAGER_PORT || 3001;

app.use(express.json());

// Placeholder for listing files
app.get('/files', (req: Request, res: Response) => {
  res.json({ message: 'List of files (placeholder)', files: [] });
});

// Placeholder for uploading a file
app.post('/files/upload', (req: Request, res: Response) => {
  // In a real app, you'd handle file uploads using middleware like multer
  console.log('Received file upload request (body):', req.body);
  res.status(201).json({ message: 'File uploaded (placeholder)', file: req.body.fileName || 'unknown_file' });
});

// Placeholder for reading a file
app.get('/files/:fileName', (req: Request, res: Response) => {
  const { fileName } = req.params;
  res.json({ message: `Content of ${fileName} (placeholder)`, content: `This is a placeholder for ${fileName}` });
});

app.listen(PORT, () => {
  console.log(`File Manager service HTTP server started on port ${PORT}`);
});

export default app; // Exporting the app instance if needed