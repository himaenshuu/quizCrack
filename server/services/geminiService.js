const { GoogleGenerativeAI } = require('@google/generative-ai');
const { extractTextFromURL } = require('./urlService');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const SYSTEM_PROMPT = `You are an expert in answering technical quiz questions. Please provide a clear, concise, and well-structured answer to the following question. Avoid unnecessary explanation unless required. Use bullet points or short paragraphs if helpful.`;

async function processWithGemini(text, context = '') {
    try {
        if (!text || typeof text !== 'string') {
            throw new Error('Invalid input text');
        }

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
        const prompt = `${SYSTEM_PROMPT}\n\nContext: ${context}\n\n${text}`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Error processing with Gemini:', error);
        if (error.message.includes('API key')) {
            throw new Error('Invalid or missing Google API key');
        }
        throw new Error('Failed to process the input. Please try again.');
    }
}

async function processPDFWithGemini(pdfBuffer, context = '') {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
        const base64PDF = pdfBuffer.toString('base64');
        const prompt = `${SYSTEM_PROMPT}\n\nContext: ${context}\n\nPlease analyze this PDF document and provide relevant information.`;

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    mimeType: "application/pdf",
                    data: base64PDF
                }
            }
        ]);

        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Error processing PDF with Gemini:', error);
        throw new Error('Failed to process the PDF with Gemini. Please ensure the PDF is in a supported format.');
    }
}

async function processImageWithGemini(imageBuffer, context = '') {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
        const base64Image = imageBuffer.toString('base64');
        const prompt = `${SYSTEM_PROMPT}\n\nContext: ${context}\n\nPlease analyze this image and provide relevant information.`;

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    mimeType: "image/jpeg",
                    data: base64Image
                }
            }
        ]);

        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Error processing image with Gemini:', error);
        throw new Error('Failed to process the image with Gemini. Please ensure the image is in a supported format (JPEG, PNG).');
    }
}

async function processURLWithGemini(url, question, context = '') {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
        const webContent = await extractTextFromURL(url);
        const prompt = `${SYSTEM_PROMPT}\n\nContext: ${context}\n\nWeb Content: ${webContent}\n\nQuestion: ${question}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Error processing URL with Gemini:', error);
        throw new Error('Failed to process URL with Gemini');
    }
}

module.exports = {
    processWithGemini,
    processPDFWithGemini,
    processImageWithGemini,
    processURLWithGemini
}; 