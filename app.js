// 1. Inyectar librería de IA (KNN Classifier) sin modificar el HTML
const knnScript = document.createElement('script');
knnScript.src = "https://cdn.jsdelivr.net/npm/@tensorflow-models/knn-classifier";
document.head.appendChild(knnScript);

const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('canvasElement');
const canvasCtx = canvasElement.getContext('2d');
const textoTraduccion = document.getElementById('textoTraduccion');

// Variables del nuevo sistema FARO
let classifier;
let isRecording = false;
let labelToRecord = "";
let exampleCount = {};

// 2. Construir la interfaz dinámicamente sin tocar HTML
function crearInterfazFARO() {
    const panel = document.createElement('div');
    panel.id = 'faro-controls';

    const titulo = document.createElement('h3');
    titulo.innerText = "Añadir Nueva Seña";
    titulo.style.margin = "0 0 5px 0";
    titulo.style.fontSize = "18px";
    titulo.style.textAlign = "center";

    const inputSeña = document.createElement('input');
    inputSeña.type = 'text';
    inputSeña.id = 'faro-input';
    inputSeña.placeholder = 'Ej: UNIVERSIDAD';

    const btnGrabar = document.createElement('button');
    btnGrabar.id = 'faro-btn-add';
    btnGrabar.innerText = "Mantener presionado";

    const statusTexto = document.createElement('div');
    statusTexto.id = 'faro-status';
    statusTexto.innerText = "Muestras: 0";

    panel.appendChild(titulo);
    panel.appendChild(inputSeña);
    panel.appendChild(btnGrabar);
    panel.appendChild(statusTexto);
    document.body.appendChild(panel);

    // Lógica para grabar al mantener presionado el botón
    btnGrabar.addEventListener('mousedown', () => {
        const seña = inputSeña.value.trim().toUpperCase();
        if(seña === "") {
            alert("Primero escribe el nombre de la seña");
            return;
        }
        labelToRecord = seña;
        isRecording = true;
        btnGrabar.style.backgroundColor = "#ff2a2a";
        btnGrabar.innerText = "¡GRABANDO!";
    });

    const detenerGrabacion = () => {
        isRecording = false;
        btnGrabar.style.backgroundColor = "#F57510";
        btnGrabar.innerText = "Mantener presionado";
    };

    btnGrabar.addEventListener('mouseup', detenerGrabacion);
    btnGrabar.addEventListener('mouseleave', detenerGrabacion);
}

// Inicializar sistema cuando cargue la página
window.addEventListener('DOMContentLoaded', () => {
    crearInterfazFARO();
    knnScript.onload = () => {
        classifier = knnClassifier.create();
        textoTraduccion.innerText = "¡Sistema listo! Agrega una seña.";
    };
});

// 3. Extracción de coordenadas estricta
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

// 4. Procesamiento Central
async function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    // Dibujar esqueleto
    if (results.leftHandLandmarks) {
        drawConnectors(canvasCtx, results.leftHandLandmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 4});
        drawLandmarks(canvasCtx, results.leftHandLandmarks, {color: '#FF0000', lineWidth: 2});
    }
    if (results.rightHandLandmarks) {
        drawConnectors(canvasCtx, results.rightHandLandmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 4});
        drawLandmarks(canvasCtx, results.rightHandLandmarks, {color: '#FF0000', lineWidth: 2});
    }

    // IA Web Nativa
    if (classifier && (results.leftHandLandmarks || results.rightHandLandmarks)) {
        let keypoints = extractKeypoints(results);
        const tensor = tf.tensor1d(keypoints); 

        // Si el botón está presionado, guardamos el movimiento
        if (isRecording && labelToRecord !== "") {
            classifier.addExample(tensor, labelToRecord);
            
            if(!exampleCount[labelToRecord]) exampleCount[labelToRecord] = 0;
            exampleCount[labelToRecord]++;
            document.getElementById('faro-status').innerText = `Muestras de ${labelToRecord}: ${exampleCount[labelToRecord]}`;
        } 
        // Si no estamos grabando y ya existen señas, predecimos
        else if (classifier.getNumClasses() > 0) {
            const result = await classifier.predictClass(tensor);
            const confianza = result.confidences[result.label];
            
            // Termómetro y validación
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
            } else {
                textoTraduccion.innerText = "Esperando seña...";
            }
        }
        
        tensor.dispose(); // Vital para que no se congele el navegador
    }

    canvasCtx.restore();
}

// 5. Configuración de Cámara
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
