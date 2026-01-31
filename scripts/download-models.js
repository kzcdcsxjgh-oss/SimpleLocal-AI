#!/usr/bin/env node
/**
 * Downloads AI models for bundling with the application.
 * This ensures the app works immediately after installation without requiring internet.
 *
 * Models:
 * - Embedding: Xenova/all-MiniLM-L6-v2 (ONNX, ~23MB)
 * - Generation: Phi-3.5-mini-instruct Q4_K_M (GGUF, ~2.3GB)
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Embedding model files (transformers.js / ONNX)
const EMBEDDING_MODEL = {
  name: 'Xenova/all-MiniLM-L6-v2',
  files: [
    'config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'onnx/model_quantized.onnx',
  ],
};

// Generation model (GGUF for node-llama-cpp)
// Phi-3.5-mini-instruct: Best quality/size ratio for local laptops
// Q4_K_M quantization: Good quality, ~2.3GB size, runs on 8GB RAM
const GENERATION_MODEL = {
  name: 'Phi-3.5-mini-instruct-Q4_K_M.gguf',
  url: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
};

const MODELS_DIR = path.join(__dirname, '..', 'models');
const HF_BASE_URL = 'https://huggingface.co';
const MAX_REDIRECTS = 10;

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Download a file from URL to local path with proper redirect handling
 */
function downloadFile(url, destPath, displayName = null) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const fileName = displayName || path.basename(destPath);

    // Check if file already exists
    if (fs.existsSync(destPath)) {
      const stats = fs.statSync(destPath);
      console.log(`  [SKIP] Already exists: ${fileName} (${formatBytes(stats.size)})`);
      resolve();
      return;
    }

    console.log(`  [DOWN] ${fileName}...`);

    let redirectCount = 0;

    const doRequest = (requestUrl) => {
      const parsedUrl = new URL(requestUrl);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'User-Agent': 'SimpleLocal-AI-Downloader/1.0',
        },
      };

      const req = protocol.request(options, (response) => {
        // Handle ALL redirect status codes (301, 302, 303, 307, 308)
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          redirectCount++;
          if (redirectCount > MAX_REDIRECTS) {
            reject(new Error(`Too many redirects (>${MAX_REDIRECTS})`));
            return;
          }

          // Handle relative and absolute redirects
          let redirectUrl = response.headers.location;
          if (!redirectUrl.startsWith('http')) {
            redirectUrl = new URL(redirectUrl, requestUrl).href;
          }

          doRequest(redirectUrl);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode} for ${requestUrl}`));
          return;
        }

        const file = fs.createWriteStream(destPath);
        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;
        let lastProgressUpdate = Date.now();

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          const now = Date.now();
          // Update progress every 500ms to avoid too much output
          if (totalSize && (now - lastProgressUpdate > 500)) {
            const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
            const downloaded = formatBytes(downloadedSize);
            const total = formatBytes(totalSize);
            process.stdout.write(`\r  [DOWN] ${fileName}... ${percent}% (${downloaded} / ${total})   `);
            lastProgressUpdate = now;
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          if (totalSize) {
            process.stdout.write(`\r  [DOWN] ${fileName}... 100% (${formatBytes(totalSize)})        \n`);
          } else {
            process.stdout.write('\n');
          }
          resolve();
        });

        file.on('error', (err) => {
          fs.unlink(destPath, () => {}); // Delete partial file
          reject(err);
        });
      });

      req.on('error', (err) => {
        fs.unlink(destPath, () => {}); // Delete partial file
        reject(err);
      });

      req.end();
    };

    doRequest(url);
  });
}

/**
 * Download embedding model files from HuggingFace
 */
async function downloadEmbeddingModel() {
  console.log(`\nDownloading embedding model: ${EMBEDDING_MODEL.name}...`);

  const modelDir = path.join(MODELS_DIR, EMBEDDING_MODEL.name.replace('/', '--'));

  for (const file of EMBEDDING_MODEL.files) {
    const url = `${HF_BASE_URL}/${EMBEDDING_MODEL.name}/resolve/main/${file}`;
    const destPath = path.join(modelDir, file);

    try {
      await downloadFile(url, destPath);
    } catch (error) {
      console.error(`\n  [FAIL] ${file}: ${error.message}`);
      throw error;
    }
  }

  console.log(`  [DONE] ${EMBEDDING_MODEL.name}`);
}

/**
 * Download generation model (GGUF file)
 */
async function downloadGenerationModel() {
  console.log(`\nDownloading generation model: ${GENERATION_MODEL.name}...`);
  console.log('  This is a large file (~2.3GB), please be patient...\n');

  const destPath = path.join(MODELS_DIR, GENERATION_MODEL.name);

  try {
    await downloadFile(GENERATION_MODEL.url, destPath, GENERATION_MODEL.name);
    console.log(`  [DONE] ${GENERATION_MODEL.name}`);
  } catch (error) {
    console.error(`\n  [FAIL] ${GENERATION_MODEL.name}: ${error.message}`);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('SimpleLocal AI - Model Downloader');
  console.log('='.repeat(60));
  console.log(`\nModels will be saved to: ${MODELS_DIR}`);
  console.log('\nModels to download:');
  console.log(`  - Embedding: ${EMBEDDING_MODEL.name} (~23MB)`);
  console.log(`  - Generation: ${GENERATION_MODEL.name} (~2.3GB)`);

  // Create models directory
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }

  // Download embedding model
  await downloadEmbeddingModel();

  // Download generation model
  await downloadGenerationModel();

  console.log('\n' + '='.repeat(60));
  console.log('All models downloaded successfully!');
  console.log('='.repeat(60));

  // Calculate total size
  let totalSize = 0;
  const calculateSize = (dir) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        calculateSize(filePath);
      } else {
        totalSize += stat.size;
      }
    }
  };

  calculateSize(MODELS_DIR);
  console.log(`\nTotal size: ${formatBytes(totalSize)}`);
}

main().catch((error) => {
  console.error('\nFailed to download models:', error.message);
  process.exit(1);
});
