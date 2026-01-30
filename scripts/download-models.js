#!/usr/bin/env node
/**
 * Downloads AI models for bundling with the application.
 * This ensures the app works immediately after installation without requiring internet.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Models to download
const MODELS = {
  'Xenova/all-MiniLM-L6-v2': [
    'config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'onnx/model_quantized.onnx',
  ],
  'Xenova/Qwen1.5-0.5B-Chat': [
    'config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'generation_config.json',
    'onnx/decoder_model_merged_quantized.onnx',
  ],
};

const MODELS_DIR = path.join(__dirname, '..', 'models');
const HF_BASE_URL = 'https://huggingface.co';

/**
 * Download a file from URL to local path
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Check if file already exists
    if (fs.existsSync(destPath)) {
      console.log(`  [SKIP] Already exists: ${path.basename(destPath)}`);
      resolve();
      return;
    }

    console.log(`  [DOWN] ${path.basename(destPath)}...`);

    const file = fs.createWriteStream(destPath);

    const request = (url) => {
      https.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          request(response.headers.location);
          return;
        }

        if (response.statusCode !== 200) {
          fs.unlinkSync(destPath);
          reject(new Error(`Failed to download: ${response.statusCode} ${url}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          if (totalSize) {
            const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
            process.stdout.write(`\r  [DOWN] ${path.basename(destPath)}... ${percent}%`);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          process.stdout.write('\n');
          resolve();
        });
      }).on('error', (err) => {
        fs.unlinkSync(destPath);
        reject(err);
      });
    };

    request(url);
  });
}

/**
 * Download all files for a model
 */
async function downloadModel(modelName, files) {
  console.log(`\nDownloading ${modelName}...`);

  const modelDir = path.join(MODELS_DIR, modelName.replace('/', '--'));

  for (const file of files) {
    const url = `${HF_BASE_URL}/${modelName}/resolve/main/${file}`;
    const destPath = path.join(modelDir, file);

    try {
      await downloadFile(url, destPath);
    } catch (error) {
      console.error(`  [FAIL] ${file}: ${error.message}`);
      throw error;
    }
  }

  console.log(`  [DONE] ${modelName}`);
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('SimpleLocal AI - Model Downloader');
  console.log('='.repeat(60));
  console.log(`\nModels will be saved to: ${MODELS_DIR}\n`);

  // Create models directory
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }

  // Download each model
  for (const [modelName, files] of Object.entries(MODELS)) {
    await downloadModel(modelName, files);
  }

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
  console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((error) => {
  console.error('\nFailed to download models:', error.message);
  process.exit(1);
});
