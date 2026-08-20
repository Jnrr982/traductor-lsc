// Importaciones de Firebase Modular (Desde el CDN oficial de Google)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get, child } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Tu configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCaJQY6N4mv425vmNP_LfRg96z_T-b-x48",
    authDomain: "traductorlsc-9c550.firebaseapp.com",
    databaseURL: "https://traductorlsc-9c550-default-rtdb.firebaseio.com",
    projectId: "traductorlsc-9c550",
    storageBucket: "traductorlsc-9c550.firebasestorage.app",
    messagingSenderId: "268728876389",
    appId: "1:268728876389:web:aada44408906cfe231b58c",
    measurementId: "G-HQ504NTB1L"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Referencias del DOM
const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('canvasElement');
const canvasCtx = canvasElement.getContext('2d');
const textoTraduccion = document.getElementById('textoTraduccion');

const inputSena = document.getElementById('input-sena');
const btnGrabar = document.getElementById('btn-grabar');
const statusTexto = document.getElementById('status-texto');
const btnSubir = document.getElementById('btn-subir');
const btnDescargar = document.getElementById('btn-descargar');
const nubeStatus = document.getElementById('nube-status');

// Variables Globales
let classifier = knnClassifier.create();
let isRecording = false;
let labelToRecord = "";
let exampleCount = {};
// Variable para evitar que la voz se repita infinitamente
let ultimaSenaHablada = "";

// Función que invoca el sintetizador del navegador
function reproducirVoz(texto) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Corta cualquier audio anterior
        const mensaje = new SpeechSynthesisUtterance(texto);
        mensaje.lang = 'es-CO'; // Configurado para acento de Colombia
        mensaje.rate = 1.0;     // Velocidad normal
        window.speechSynthesis.speak(mensaje);
    }
}

// ==========================================
// 1. LÓGICA DE GRABACIÓN LOCAL
// ==========================================
btnGrabar.addEventListener('click', () => {
    if (!isRecording) {
        const seña = inputSena.value.trim().toUpperCase();
        if(seña === "") {
            alert("Primero escribe el nombre de la seña");
            return;
        }
        labelToRecord = seña;
        isRecording = true;
        btnGrabar.style.backgroundColor = "#ff2a2a";
        btnGrabar.innerText = "¡GRABANDO! (Clic para parar)";
    } else {
        isRecording = false;
        btnGrabar.style.backgroundColor = "#F57510";
        btnGrabar.innerText = "Empezar a grabar";
    }
});

// ==========================================
// 2. LÓGICA DE LA NUBE (FIREBASE)
// ==========================================

// SUBIR A LA NUBE (Sincronización Inteligente)
btnSubir.addEventListener('click', async () => {
    if (classifier.getNumClasses() === 0) {
        alert("No tienes ninguna seña para subir.");
        return;
    }
    
    nubeStatus.innerText = "Sincronizando y fusionando datos...";
    btnSubir.disabled = true;

    try {
        // 1. Revisar silenciosamente qué hay en la nube ahora mismo
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, 'modelo_global'));
        
        // Si hay datos en la nube los guardamos, si no, creamos un espacio vacío
        let nubeData = snapshot.exists() ? snapshot.val() : {};

        // 2. Extraer las señas que el usuario tiene en su cámara local
        let localDataset = classifier.getClassifierDataset();
        
        // 3. Mezclar: Añadimos (o actualizamos) las señas locales dentro de los datos de la nube
        Object.keys(localDataset).forEach((key) => {
            let data = localDataset[key].dataSync();
            nubeData[key] = {
                data: Array.from(data),
                shape: localDataset[key].shape
            };
        });

        // 4. Subir el "Super-Cerebro" (La combinación de todo)
        await set(ref(db, 'modelo_global'), nubeData);
        nubeStatus.innerText = "¡Sincronización perfecta! Todo guardado.";
    } catch (error) {
        console.error("Error sincronizando con Firebase:", error);
        nubeStatus.innerText = "Error al subir.";
    }
    btnSubir.disabled = false;
});

// DESCARGAR DE LA NUBE
btnDescargar.addEventListener('click', async () => {
    nubeStatus.innerText = "Descargando conocimiento...";
    btnDescargar.disabled = true;

    try {
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, 'modelo_global'));
        
        if (snapshot.exists()) {
            let datasetObj = snapshot.val();
            let tensorObj = {};
            
            // Reconstruimos los Tensores Matemáticos a partir de los Arrays
            Object.keys(datasetObj).forEach((key) => {
                tensorObj[key] = tf.tensor2d(datasetObj[key].data, datasetObj[key].shape);
                exampleCount[key] = datasetObj[key].shape[0]; 
            });
            
            classifier.setClassifierDataset(tensorObj);
            nubeStatus.innerText = "¡Modelo cargado! IA lista.";
        } else {
            nubeStatus.innerText = "La nube está vacía.";
        }
    } catch (error) {
        console.error("Error descargando de Firebase:", error);
        nubeStatus.innerText = "Error de conexión.";
    }
    btnDescargar.disabled = false;
});

// ==========================================
// 3. VISIÓN POR COMPUTADORA (MediaPipe)
// ==========================================
textoTraduccion.innerText = "¡Sistema listo! Agrega o descarga señas.";

function extractKeypoints(results) {
    let lh = new Array(63).fill(0);
    let rh = new Array(63).fill(0);

    if (results.leftHandLandmarks) {
        for (let i = 0; i < results.leftHandLandmarks.length; i++) {
            lh[i*3] = results.leftHandLandmarks[i].x || 0;
            lh[i*3+1] = results.leftHandLandmarks[i].y || 0;
            lh[i*3+2] = results.leftHandLandmarks[i].z || 0;
        }
    }
    if (results.rightHandLandmarks) {
        for (let i = 0; i < results.rightHandLandmarks.length; i++) {
            rh[i*3] = results.rightHandLandmarks[i].x || 0;
            rh[i*3+1] = results.rightHandLandmarks[i].y || 0;
            rh[i*3+2] = results.rightHandLandmarks[i].z || 0;
        }
    }
    return [...lh, ...rh];
}

async function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    // Dibujar esqueleto de manos
    if (results.leftHandLandmarks) drawConnectors(canvasCtx, results.leftHandLandmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 4});
    if (results.rightHandLandmarks) drawConnectors(canvasCtx, results.rightHandLandmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 4});

    // Lógica de IA
    if (results.leftHandLandmarks || results.rightHandLandmarks) {
        let keypoints = extractKeypoints(results);
        const tensor = tf.tensor1d(keypoints); 

        if (isRecording && labelToRecord !== "") {
            classifier.addExample(tensor, labelToRecord);
            if(!exampleCount[labelToRecord]) exampleCount[labelToRecord] = 0;
            exampleCount[labelToRecord]++;
            statusTexto.innerText = `Muestras de ${labelToRecord}: ${exampleCount[labelToRecord]}`;
        } 
        else if (classifier.getNumClasses() > 0) {
            const result = await classifier.predictClass(tensor);
            const confianza = result.confidences[result.label];
            
            // Termómetro visual
            let anchoBarra = Math.floor(confianza * 200);
            let altoCanvas = canvasElement.height;
            
            canvasCtx.fillStyle = 'rgba(100, 100, 100, 0.9)';
            canvasCtx.fillRect(10, altoCanvas - 50, 200, 30);
            canvasCtx.fillStyle = 'rgba(245, 117, 16, 0.9)';
            canvasCtx.fillRect(10, altoCanvas - 50, anchoBarra, 30);
            canvasCtx.strokeStyle = 'white';
            canvasCtx.lineWidth = 2;
            canvasCtx.strokeRect(10, altoCanvas - 50, 200, 30);
            canvasCtx.font = "bold 16px Arial";
            canvasCtx.fillStyle = "white";
            
            if (confianza > 0.70) {
                textoTraduccion.innerText = result.label;
                canvasCtx.fillText(`${result.label}: ${Math.floor(confianza * 100)}%`, 15, altoCanvas - 30);
                
                // --- NUEVA LÓGICA DE VOZ ---
                // Solo habla si la seña es diferente a la que acaba de pronunciar
                if (result.label !== ultimaSenaHablada) {
                    reproducirVoz(result.label);
                    ultimaSenaHablada = result.label;
                }
            } else {
                textoTraduccion.innerText = "Esperando seña...";
                // Al perder la seña, reseteamos la memoria para poder repetirla luego
                ultimaSenaHablada = ""; 
            }
        }
        tensor.dispose();
    }
    canvasCtx.restore();
}

// Inicialización de la Cámara
const holistic = new Holistic({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
}});

holistic.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});
holistic.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await holistic.send({image: videoElement});
    },
    width: 640,
    height: 480
});
camera.start();
// ==========================================
// 4. AUTO-CARGA AL ABRIR LA PÁGINA
// ==========================================
window.addEventListener('load', () => {
    // Simula un clic en el botón de descargar automáticamente
    setTimeout(() => {
        btnDescargar.click();
    }, 1500); // Esperamos 1.5 segundos para asegurar que todo el HTML cargó
});
