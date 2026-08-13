const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('canvasElement');
const canvasCtx = canvasElement.getContext('2d');
const textoTraduccion = document.getElementById('textoTraduccion');

let model;
let sequence = [];
// ¡TUS 40 SEÑAS!
let actions = [
    'Hola', 'Buenos_dias', 'Como_estas', 'Bien', 'Gracias',
    'De_nada', 'Por_favor', 'Buenas_tardes', 'Perdon', 'Adios',
    'Clase', 'Profesor', 'Estudiante', 'Interprete', 'Biblioteca',
    'Hora', 'No_entiendo', 'Repetir', 'Preguntar', 'Examen',
    'Tarea', 'Tema', 'Computador', 'Dar', 'Firmar',
    'Bano', 'Cafeteria', 'Tengo_hambre', 'Donde', 'Universidad',
    'No', 'Mal', 'Companero', 'Necesito_ayuda', 'Si',
    'Importante', 'Despacio', 'Fecha', 'Cuanto', 'Mas_O_Menos'
];

// Cargar el modelo
async function cargarModeloAI() {
    try {
        // La ruta sin el "./" está perfecta
        model = await tf.loadLayersModel('modelo_web_final/model.json'); 
        textoTraduccion.innerText = "¡Modelo cargado! Esperando seña...";
    } catch (error) {
        console.error("Error:", error);
    }
}
cargarModeloAI();

// Variables globales de estabilización
let frameCount = 0;
let ultimaConfianza = 0;
let ultimaSeñaAnalizada = "Esperando...";
let predictions = [];

// 1. Extracción BLINDADA (Garantiza 126 puntos puros numéricos)
function extractKeypoints(results) {
    let lh = new Array(63).fill(0);
    let rh = new Array(63).fill(0);

    if (results.leftHandLandmarks) {
        for (let i = 0; i < results.leftHandLandmarks.length; i++) {
            // El "|| 0" asegura que si llega un vacío, se convierte en cero
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

// 2. Procesamiento Central
function onResults(results) {
    frameCount++;
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    // Dibujar el esqueleto basándonos en los resultados de Holistic
    if (results.leftHandLandmarks) {
        drawConnectors(canvasCtx, results.leftHandLandmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 4});
        drawLandmarks(canvasCtx, results.leftHandLandmarks, {color: '#FF0000', lineWidth: 2});
    }
    if (results.rightHandLandmarks) {
        drawConnectors(canvasCtx, results.rightHandLandmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 4});
        drawLandmarks(canvasCtx, results.rightHandLandmarks, {color: '#FF0000', lineWidth: 2});
    }

    if (model) {
        let keypoints = extractKeypoints(results);
        sequence.push(keypoints);
        
        if (sequence.length > 45) {
            sequence.shift();
        }

        if (sequence.length === 45 && frameCount % 6 === 0) {
            const inputTensor = tf.tensor3d(sequence.flat(), [1, 45, 126]);
            
            const prediction = model.predict(inputTensor);
            const values = Array.from(prediction.dataSync());
            
            let maxIndex = values.indexOf(Math.max(...values));
            ultimaConfianza = values[maxIndex];
            ultimaSeñaAnalizada = actions[maxIndex];

            predictions.push(maxIndex);
            if (predictions.length > 6) {
                predictions.shift();
            }

            if (predictions.length > 0) {
                let counts = {};
                for (let num of predictions) {
                    counts[num] = (counts[num] || 0) + 1;
                }
                
                let mostCommonIndex = predictions[0];
                let maxCount = 0;
                for (let num in counts) {
                    if (counts[num] > maxCount) {
                        maxCount = counts[num];
                        mostCommonIndex = parseInt(num);
                    }
                }

                if (maxCount >= 4 && values[mostCommonIndex] > 0.85) {
                    textoTraduccion.innerText = actions[mostCommonIndex];
                } else if (ultimaConfianza < 0.40) {
                    textoTraduccion.innerText = "Esperando seña...";
                }
            }

            tf.dispose([inputTensor, prediction]);
        }
    }

    // =================================================================
    // TERMÓMETRO EN PANTALLA
    // =================================================================
    let anchoBarra = Math.floor(ultimaConfianza * 200);
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
    canvasCtx.fillText(`${ultimaSeñaAnalizada}: ${Math.floor(ultimaConfianza * 100)}%`, 15, altoCanvas - 30);

    canvasCtx.restore();
}

// 3. Configuración del nuevo motor Holistic
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

// 4. Arranque de la cámara
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await holistic.send({image: videoElement});
    },
    width: 640,
    height: 480
});
camera.start();
