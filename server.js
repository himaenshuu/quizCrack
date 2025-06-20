const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { PDFDocument } = require("pdf-lib");
const sharp = require("sharp");
const { createWorker } = require("tesseract.js");
const axios = require("axios");
const cheerio = require("cheerio");
const admin = require("firebase-admin");
require("dotenv").config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Configure CORS based on environment
const corsOptions = {
  origin:
    process.env.NODE_ENV === "production"
      ? process.env.FRONTEND_URL
      : "http://localhost:3000",
  methods: ["GET", "POST"],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Import routes
const pdfRoutes = require("./server/routes/pdfRoutes");
const imageRoutes = require("./server/routes/imageRoutes");
const textRoutes = require("./server/routes/textRoutes");
const urlRoutes = require("./server/routes/urlRoutes");
// const googleFormsRoutes = require('./server/routes/googleForms');

// Use routes
app.use("/api", pdfRoutes);
app.use("/api", imageRoutes);
app.use("/api", textRoutes);
app.use("/api", urlRoutes);
// app.use('/api/google-forms', googleFormsRoutes);

// Add authentication middleware
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(" ")[1];
    admin
      .auth()
      .verifyIdToken(token)
      .then((decodedToken) => {
        req.user = decodedToken;
        next();
      })
      .catch((error) => {
        console.error("Error verifying token:", error);
        res.status(401).json({ error: "Unauthorized" });
      });
  } else {
    next();
  }
});

// Serve static files in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "client/build")));

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "client/build", "index.html"));
  });
}

// Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const SYSTEM_PROMPT = `You are an ai agent named 'Alex' who is expert in answering questions.You have been developed by Quizcrack organization. Please provide a clear, concise, and well-structured answer to the questions. Avoid unnecessary explanation unless required. Use bullet points and short paragraphs if helpful.`;

// Function to convert PDF to base64
async function convertPDFToBase64(pdfPath) {
  try {
    const pdfBytes = fs.readFileSync(pdfPath);
    return pdfBytes.toString("base64");
  } catch (error) {
    console.error("Error converting PDF to base64:", error);
    return null;
  }
}

// Function to process PDF with Gemini
async function processPDFWithGemini(pdfBuffer, context = "") {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

    // Validate PDF buffer
    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
      throw new Error("Invalid PDF buffer");
    }

    // Convert PDF buffer to base64
    const base64PDF = pdfBuffer.toString("base64");

    // Validate base64 string
    if (!base64PDF || base64PDF.length === 0) {
      throw new Error("Failed to convert PDF to base64");
    }

    // Create prompt with context
    const prompt = `${SYSTEM_PROMPT}\n\nContext: ${context}\n\nPlease analyze this PDF document and provide relevant information.`;

    console.log("Sending PDF to Gemini...");

    // Generate content with PDF
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: "application/pdf",
          data: base64PDF,
        },
      },
    ]);

    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Detailed Gemini PDF processing error:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    throw new Error(`Failed to process the PDF with Gemini: ${error.message}`);
  }
}

// Function to process with Gemini
async function processWithGemini(text, context = "") {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Invalid input text");
  }
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-lite",
      generationConfig: {
        temperature: 0.3,
        topP: 1,
        topK: 1,
        maxOutputTokens: 1024,
        stopSequences: ["\n\n"],
      },
    });

    const prompt = `${SYSTEM_PROMPT}\n\nContext: ${context}\n\n${text.trim()}`;

    const { response } = await model.generateContent(prompt);

    return response.text();
  } catch (error) {
    console.error("Gemini API Error:", error);

    if (error.message?.includes("API key")) {
      throw new Error("Invalid or missing Google API key.");
    }

    throw new Error("Gemini processing failed. Please try again.");
  }
    const { response } = await model.generateContent(prompt);

    return response.text();
  } catch (error) {
    console.error("Gemini API Error:", error);

    if (error.message?.includes("API key")) {
      throw new Error("Invalid or missing Google API key.");
    }

    throw new Error("Gemini processing failed. Please try again.");
  }
}


// Function to extract text from URL
async function extractTextFromURL(url) {
  try {
    // Validate URL format
    try {
      new URL(url);
    } catch (e) {
      throw new Error("Invalid URL format");
    }

    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    // Remove script and style elements
    $("script, style").remove();

    // Extract text from body
    const text = $("body").text().replace(/\s+/g, " ").trim();

    if (!text) {
      throw new Error("No text content found on the webpage");
    }

    return text;
  } catch (error) {
    console.error("Error extracting text from URL:", error);
    if (error.response) {
      throw new Error(
        `Failed to fetch URL: ${error.response.status} ${error.response.statusText}`
      );
    }
    throw new Error(
      "Failed to extract text from URL. Please check if the URL is accessible."
    );
  }
}

// Function to process URL with Gemini
async function processURLWithGemini(url, question, context = "") {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // Extract text from URL
    const webContent = await extractTextFromURL(url);

    // Create prompt with context and question
    const prompt = `${SYSTEM_PROMPT}\n\nContext: ${context}\n\nWeb Content: ${webContent}\n\nQuestion: ${question}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Error processing URL with Gemini:", error);
    throw new Error("Failed to process URL with Gemini");
  }
}

// Function to process image with Gemini
async function processImageWithGemini(imageBuffer, context = "") {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

    // Convert image buffer to base64
    const base64Image = imageBuffer.toString("base64");

    // Create prompt with context
    const prompt = `${SYSTEM_PROMPT}\n\nContext: ${context}\n\nPlease analyze this image and provide relevant information.`;

    // Generate content with image
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Image,
        },
      },
    ]);

    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Error processing image with Gemini:", error);
    throw new Error(
      "Failed to process the image with Gemini. Please ensure the image is in a supported format (JPEG, PNG)."
    );
  }
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
