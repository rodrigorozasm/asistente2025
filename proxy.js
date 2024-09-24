import express from 'express';
import axios from 'axios';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import multer from 'multer';
import ffmpegPath from 'ffmpeg-static'; // Importa la ruta de ffmpeg desde ffmpeg-static
import FormData from 'form-data';

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/') // Asegúrate de que esta carpeta exista
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
  }
});

const upload = multer({ storage: storage });

app.post('/transcribe', upload.single('file'), async (req, res) => {
  console.log('Recibida solicitud de transcripción');
  try {
    const file = req.file;
    const { name, datetime, options } = req.body;

    console.log('Archivo recibido:', file);
    console.log('Nombre:', name);
    console.log('Fecha y hora:', datetime);
    console.log('Opciones:', options);

    if (!file || !name || !datetime) {
      console.log('Error: Faltan campos requeridos');
      return res.status(400).json({ message: 'Bad Request: Missing required fields' });
    }

    const filepath = path.resolve(file.path);
    console.log(`Ruta del archivo: ${filepath}`);

    if (!fs.existsSync(filepath)) {
      console.log('Error: El archivo no se guardó correctamente en el servidor');
      return res.status(500).json({ message: 'Internal Server Error: File not saved correctly' });
    }

    const stats = fs.statSync(filepath);
    if (stats.size === 0) {
      console.log('Error: El archivo guardado está vacío');
      return res.status(400).json({ message: 'Bad Request: Uploaded file is empty' });
    }

    console.log(`Archivo guardado correctamente. Tamaño: ${stats.size} bytes`);

    const outputFilename = `out-${name}.webm`;
    const outFile = path.resolve(path.dirname(filepath), outputFilename);

    const ffmpegCommand = `"${ffmpegPath}" -i "${filepath}" -af silenceremove=stop_periods=-1:stop_duration=1:stop_threshold=-50dB "${outFile}"`;

    console.log('Ejecutando comando FFmpeg:', ffmpegCommand);

    exec(ffmpegCommand, async (error, stdout, stderr) => {
      if (error) {
        console.error('Error al ejecutar ffmpeg:', error);
        console.error('Salida de error de ffmpeg:', stderr);
        return res.status(500).json({ message: 'Error processing audio file', error: error.message, stderr });
      }

      console.log('Salida estándar de ffmpeg:', stdout);
      console.log('Salida de error de ffmpeg:', stderr);

      if (!fs.existsSync(outFile)) {
        console.log('Error: Archivo procesado por FFmpeg no encontrado');
        return res.status(500).json({ message: 'Internal Server Error: Processed file not found' });
      }

      const outStats = fs.statSync(outFile);
      console.log(`Archivo de salida guardado. Tamaño: ${outStats.size} bytes`);

      try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(outFile));
        formData.append('model', 'whisper-1');
        formData.append('response_format', 'vtt');
        formData.append('language', JSON.parse(options).language || 'es');
        formData.append('temperature', JSON.parse(options).temperature || 0);

        const whisperResponse = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Bearer `,
          },
          maxBodyLength: Infinity,
        });

        console.log('Transcripción completada');
        console.log('Contenido de la transcripción:', whisperResponse.data);

        res.json({ 
          message: 'Audio procesado y transcrito correctamente', 
          datetime, 
          filename: outputFilename, 
          transcription: whisperResponse.data
        });
      } catch (whisperError) {
        console.error('Error al transcribir con Whisper:', whisperError.response ? whisperError.response.data : whisperError.message);
        res.status(500).json({ message: 'Error transcribing with Whisper API', error: whisperError.message });
      }
    });
  } catch (error) {
    console.error('Error al manejar la transcripción:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
});

// Rutas de Pinecone existentes
app.post('/pinecone-api', async (req, res) => {
  try {
    const response = await axios.post(
      'https://asistentenuevo-ujyg5zb.svc.aped-4627-b74a.pinecone.io',
      req.body,
      {
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': '',
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error al hacer la solicitud a Pinecone:', error.message);
    res.status(error.response?.status || 500).json({
      message: 'Error al hacer la solicitud a Pinecone',
      error: error.message,
    });
  }
});

app.post('/pinecone-api/query', async (req, res) => {
  try {
    console.log("llamo a consultar en Pinecone");
    const response = await axios.post(
      'https://asistentenuevo-ujyg5zb.svc.aped-4627-b74a.pinecone.io/query',
      req.body,
      {
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': '7e6d5432-cd13-475b-92e4-276566c73c07',
        },
      }
    );
    console.log("Resultado de la consulta en Pinecone", response);
    res.json(response.data);
  } catch (error) {
    console.error('Error al hacer la solicitud a Pinecone:', error.message);
    res.status(error.response?.status || 500).json({
      message: 'Error al hacer la solicitud a Pinecone',
      error: error.message,
    });
  }
});

app.get('/pinecone-api/index/stats', async (req, res) => {
  try {
    const response = await axios.post(
      'https://asistentenuevo-ujyg5zb.svc.aped-4627-b74a.pinecone.io/describe_index_stats',
      {},
      {
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': '7e6d5432-cd13-475b-92e4-276566c73c07',
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Error al obtener estadísticas del índice de Pinecone:', error.message);
    res.status(error.response?.status || 500).json({
      message: 'Error al obtener estadísticas del índice de Pinecone',
      error: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
});
