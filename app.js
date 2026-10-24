// ==========================================================
// LSC CONECTA — Lógica de cámara, clasificación, voz y Firebase
// Mantiene el enfoque experimental del prototipo original.
// ==========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get, child } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Configuración del proyecto Firebase suministrada en el código original.
// La clave apiKey de Firebase identifica el proyecto web; la protección real
// de los datos depende de las reglas de seguridad de Realtime Database.
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

// Inicializar Firebase de forma controlada.
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

// ==========================================================
// 1. REFERENCIAS DE LA INTERFAZ
// ==========================================================
const videoElement = document.getElementById("videoElement");
const canvasElement = document.getElementById("canvasElement");
const canvasCtx = canvasElement.getContext("2d");

const textoTraduccion = document.getElementById("textoTraduccion");
const resultHint = document.getElementById("result-hint");
const inputSena = document.getElementById("input-sena");
const inputCounter = document.getElementById("input-counter");
const btnGrabar = document.getElementById("btn-grabar");
const statusTexto = document.getElementById("status-texto");
const btnSubir = document.getElementById("btn-subir");
const btnDescargar = document.getElementById("btn-descargar");
const nubeStatus = document.getElementById("nube-status");
const cloudDetail = document.getElementById("cloud-detail");
const cloudStatusBox = document.querySelector(".cloud-status-box");
const cameraStatus = document.getElementById("camera-status");
const cameraMessage = document.getElementById("camera-message");
const systemState = document.getElementById("system-state");
const systemStateText = document.getElementById("system-state-text");
const confidenceValue = document.getElementById("confidence-value");
const confidenceFill = document.getElementById("confidence-fill");
const confidenceTrack = document.getElementById("confidence-track");
const speechStatus = document.getElementById("speech-status");
const btnRepetirVoz = document.getElementById("btn-repetir-voz");
const btnDetenerVoz = document.getElementById("btn-detener-voz");
const totalClases = document.getElementById("total-clases");
const totalMuestras = document.getElementById("total-muestras");
const currentYear = document.getElementById("current-year");
const menuButton = document.getElementById("btn-menu");
const mainNavigation = document.getElementById("main-navigation");
const dropdownButtons = [...document.querySelectorAll(".nav-dropdown-toggle")];

// ==========================================================
// 2. ESTADO DE LA APLICACIÓN
// ==========================================================
const classifier = knnClassifier.create();
let isRecording = false;
let labelToRecord = "";
let exampleCount = {};
let ultimaSenaHablada = "";
let ultimaSenaReconocida = "";
let senaCandidata = "";
let contadorFrames = 0;
let isInferenceRunning = false;
let cameraStarted = false;
let speechIsSpeaking = false;

// Una etiqueta debe aparecer estable durante aproximadamente medio segundo.
const UMBRAL_FRAMES = 15;
const UMBRAL_CONFIANZA = 0.70;

// ==========================================================
// 3. FUNCIONES DE INTERFAZ Y ESTADO
// ==========================================================
function establecerEstadoSistema(mensaje, estado = "") {
  systemStateText.textContent = mensaje;
  systemState.classList.remove("is-ready", "is-error");
  if (estado === "ready") systemState.classList.add("is-ready");
  if (estado === "error") systemState.classList.add("is-error");
}

function establecerEstadoCamara(mensaje, estado = "") {
  cameraStatus.textContent = "";
  const punto = document.createElement("span");
  punto.className = "camera-status-dot";
  cameraStatus.appendChild(punto);
  cameraStatus.appendChild(document.createTextNode(` ${mensaje}`));
  cameraStatus.classList.remove("is-active", "is-error");
  if (estado === "active") cameraStatus.classList.add("is-active");
  if (estado === "error") cameraStatus.classList.add("is-error");
}

function establecerEstadoNube(mensaje, detalle = "", estado = "") {
  nubeStatus.textContent = mensaje;
  cloudDetail.textContent = detalle;
  cloudStatusBox.classList.remove("is-error", "is-busy");
  if (estado === "error") cloudStatusBox.classList.add("is-error");
  if (estado === "busy") cloudStatusBox.classList.add("is-busy");
}

function establecerEstadoGrabacion(mensaje, estado = "") {
  statusTexto.replaceChildren();
  const icono = document.createElement("span");
  icono.className = "recording-status-icon";
  icono.textContent = estado === "recording" ? "●" : estado === "error" ? "!" : "✓";
  const texto = document.createElement("span");
  texto.textContent = mensaje;
  statusTexto.append(icono, texto);
  statusTexto.classList.remove("is-recording", "is-error");
  if (estado === "recording") statusTexto.classList.add("is-recording");
  if (estado === "error") statusTexto.classList.add("is-error");
}

function establecerEstadoVoz(mensaje, estado = "") {
  speechStatus.replaceChildren();
  const punto = document.createElement("span");
  punto.className = "speech-status-dot";
  const texto = document.createElement("span");
  texto.textContent = mensaje;
  speechStatus.append(punto, texto);
  speechStatus.classList.remove("is-ready", "is-speaking");
  if (estado === "ready") speechStatus.classList.add("is-ready");
  if (estado === "speaking") speechStatus.classList.add("is-speaking");
}

function contarDatosLocales() {
  const dataset = classifier.getClassifierDataset();
  const etiquetas = Object.keys(dataset);
  let total = 0;

  for (const etiqueta of etiquetas) {
    const tensor = dataset[etiqueta];
    const cantidad = tensor?.shape?.[0] || 0;
    total += cantidad;
    exampleCount[etiqueta] = cantidad;
  }

  totalClases.textContent = String(etiquetas.length);
  totalMuestras.textContent = String(total);
  return { dataset, etiquetas, total };
}

function actualizarBarraConfianza(valor) {
  const porcentaje = Math.max(0, Math.min(100, Math.round((Number(valor) || 0) * 100)));
  confidenceValue.textContent = porcentaje > 0 ? `${porcentaje}%` : "—";
  confidenceFill.style.width = `${porcentaje}%`;
  confidenceTrack.setAttribute("aria-valuenow", String(porcentaje));
}

function mostrarResultado(texto, ayuda = "") {
  textoTraduccion.textContent = texto;
  resultHint.textContent = ayuda;
}

function actualizarEstadoVozDisponible() {
  const hayEtiqueta = Boolean(ultimaSenaReconocida);
  btnRepetirVoz.disabled = !hayEtiqueta;
  btnDetenerVoz.disabled = !speechIsSpeaking;
  if (!hayEtiqueta && !speechIsSpeaking) {
    establecerEstadoVoz("Voz lista cuando haya una seña");
  } else if (hayEtiqueta && !speechIsSpeaking) {
    establecerEstadoVoz("Traducción disponible para reproducir", "ready");
  }
}

// Firebase no admite estos caracteres en un nombre de nodo.
// Las etiquetas quedan legibles, pero se eliminan caracteres reservados.
function normalizarEtiqueta(valor) {
  return String(valor || "")
    .normalize("NFC")
    .replace(/[.#$\[\]/]/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("es-CO")
    .slice(0, 40);
}

function normalizarNombreParaGuardar(valor) {
  return String(valor || "").replace(/[.#$\[\]/]/g, "").trim();
}

function establecerBotonOcupado(boton, ocupado, textoOcupado) {
  if (!boton.dataset.textoOriginal) {
    boton.dataset.textoOriginal = boton.innerText.trim();
  }
  if (ocupado) {
    boton.disabled = true;
    boton.classList.add("is-busy-button");
    boton.dataset.textoOcupado = textoOcupado || "Procesando...";
    boton.textContent = boton.dataset.textoOcupado;
  } else {
    boton.disabled = false;
    boton.classList.remove("is-busy-button");
    // El texto original del botón puede haber cambiado por traducción.
    if (boton === btnSubir) boton.innerHTML = '<span class="button-icon" aria-hidden="true">↑</span> Sincronizar con la nube';
    if (boton === btnDescargar) boton.innerHTML = '<span class="button-icon" aria-hidden="true">↓</span> Cargar modelo de la nube';
  }
}

// ==========================================================
// 4. MENÚ DE NAVEGACIÓN Y PEQUEÑAS INTERACCIONES
// ==========================================================
function cerrarMenusDesplegables(excepto = null) {
  document.querySelectorAll(".nav-item.open").forEach((item) => {
    if (item !== excepto) {
      item.classList.remove("open");
      const boton = item.querySelector(".nav-dropdown-toggle");
      if (boton) boton.setAttribute("aria-expanded", "false");
    }
  });
}

function cerrarMenuMovil() {
  mainNavigation.classList.remove("is-open");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Abrir menú de navegación");
  document.body.classList.remove("menu-open");
}

menuButton.addEventListener("click", () => {
  const abierto = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!abierto));
  menuButton.setAttribute("aria-label", abierto ? "Abrir menú de navegación" : "Cerrar menú de navegación");
  mainNavigation.classList.toggle("is-open", !abierto);
  document.body.classList.toggle("menu-open", !abierto && window.matchMedia("(max-width: 940px)").matches);
  if (abierto) cerrarMenusDesplegables();
});

dropdownButtons.forEach((boton) => {
  boton.addEventListener("click", (evento) => {
    evento.preventDefault();
    const item = boton.closest(".nav-item");
    const yaAbierto = item.classList.contains("open");
    cerrarMenusDesplegables(item);
    item.classList.toggle("open", !yaAbierto);
    boton.setAttribute("aria-expanded", String(!yaAbierto));
  });
});

document.addEventListener("click", (evento) => {
  if (!evento.target.closest(".main-navigation")) cerrarMenusDesplegables();
  if (window.matchMedia("(max-width: 940px)").matches &&
      mainNavigation.classList.contains("is-open") &&
      !evento.target.closest(".site-header")) {
    cerrarMenuMovil();
  }
});

document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape") {
    cerrarMenusDesplegables();
    cerrarMenuMovil();
  }
});

mainNavigation.querySelectorAll('a[href^="#"]').forEach((enlace) => {
  enlace.addEventListener("click", () => {
    cerrarMenusDesplegables();
    cerrarMenuMovil();
  });
});

window.addEventListener("resize", () => {
  if (!window.matchMedia("(max-width: 940px)").matches) {
    cerrarMenuMovil();
    document.body.classList.remove("menu-open");
  }
});

inputSena.addEventListener("input", () => {
  inputCounter.textContent = `${inputSena.value.length}/40`;
});

if (currentYear) currentYear.textContent = String(new Date().getFullYear());

// ==========================================================
// 5. SÍNTESIS DE VOZ
// ==========================================================
function reproducirVoz(texto) {
  if (!("speechSynthesis" in window)) {
    establecerEstadoVoz("Este navegador no ofrece síntesis de voz", "");
    return;
  }
  const frase = String(texto || "").trim();
  if (!frase) return;

  window.speechSynthesis.cancel();
  const mensaje = new SpeechSynthesisUtterance(frase);
  mensaje.lang = "es-CO";
  mensaje.rate = 0.94;
  mensaje.pitch = 1;
  mensaje.volume = 1;

  mensaje.onstart = () => {
    speechIsSpeaking = true;
    btnDetenerVoz.disabled = false;
    btnRepetirVoz.disabled = !ultimaSenaReconocida;
    establecerEstadoVoz("Reproduciendo salida de voz", "speaking");
  };
  mensaje.onend = () => {
    speechIsSpeaking = false;
    btnDetenerVoz.disabled = true;
    actualizarEstadoVozDisponible();
  };
  mensaje.onerror = (evento) => {
    speechIsSpeaking = false;
    btnDetenerVoz.disabled = true;
    establecerEstadoVoz(evento.error === "canceled" ? "Reproducción detenida" : "No fue posible reproducir la voz");
    actualizarEstadoVozDisponible();
  };

  window.speechSynthesis.speak(mensaje);
}

btnRepetirVoz.addEventListener("click", () => {
  if (ultimaSenaReconocida) reproducirVoz(ultimaSenaReconocida);
});

btnDetenerVoz.addEventListener("click", () => {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  speechIsSpeaking = false;
  btnDetenerVoz.disabled = true;
  actualizarEstadoVozDisponible();
});

// ==========================================================
// 6. ENTRENAMIENTO LOCAL
// ==========================================================
btnGrabar.addEventListener("click", () => {
  if (!isRecording) {
    const etiqueta = normalizarEtiqueta(inputSena.value);
    if (!etiqueta) {
      establecerEstadoGrabacion("Escribe el nombre de la seña antes de iniciar la captura.", "error");
      inputSena.focus();
      return;
    }

    labelToRecord = etiqueta;
    inputSena.value = etiqueta;
    inputCounter.textContent = `${inputSena.value.length}/40`;
    isRecording = true;
    ultimaSenaHablada = "";
    senaCandidata = "";
    contadorFrames = 0;

    btnGrabar.classList.add("is-recording");
    btnGrabar.innerHTML = '<span class="button-icon" aria-hidden="true">■</span> Detener captura';
    establecerEstadoGrabacion(`Capturando ejemplos de «${labelToRecord}». Mantén la seña visible.`, "recording");
    mostrarResultado(`Registrando: ${labelToRecord}`, "El modelo está recopilando ejemplos de la seña actual.");
    establecerEstadoSistema("Registrando ejemplos", "ready");
  } else {
    isRecording = false;
    btnGrabar.classList.remove("is-recording");
    btnGrabar.innerHTML = '<span class="button-icon" aria-hidden="true">●</span> Iniciar captura';
    establecerEstadoGrabacion(`Captura detenida para «${labelToRecord}». Puedes continuar con otra seña o sincronizar el modelo.`);
    labelToRecord = "";
    contarDatosLocales();
    establecerEstadoSistema("Modelo disponible", "ready");
  }
});

// ==========================================================
// 7. SINCRONIZACIÓN DEL MODELO CON FIREBASE
// ==========================================================
async function sincronizarModeloConNube() {
  const { dataset, etiquetas } = contarDatosLocales();
  if (etiquetas.length === 0) {
    establecerEstadoNube("No hay señas para sincronizar", "Registra ejemplos antes de subir el modelo.", "error");
    return;
  }

  establecerBotonOcupado(btnSubir, true, "Sincronizando...");
  establecerEstadoNube("Sincronizando modelo...", "Se están fusionando los ejemplos locales con los datos guardados.", "busy");

  try {
    // Leer el dataset existente, para conservar las clases que no estén en local.
    const dbRef = ref(db);
    const snapshot = await get(child(dbRef, "modelo_global"));
    const nubeData = snapshot.exists() && snapshot.val() && typeof snapshot.val() === "object"
      ? snapshot.val()
      : {};

    // Reemplazar/actualizar cada clase con el tensor acumulado del clasificador local.
    for (const clave of Object.keys(dataset)) {
      const etiquetaSegura = normalizarNombreParaGuardar(clave);
      if (!etiquetaSegura) continue;
      const tensorClase = dataset[clave];
      const datos = Array.from(tensorClase.dataSync());
      nubeData[etiquetaSegura] = {
        data: datos,
        shape: Array.from(tensorClase.shape)
      };
    }

    // Escrituras por clase para evitar una única escritura muy grande.
    const clavesNube = Object.keys(nubeData);
    let completadas = 0;
    for (const etiqueta of clavesNube) {
      const registro = nubeData[etiqueta];
      if (!registro || !Array.isArray(registro.data) || !Array.isArray(registro.shape)) continue;
      const etiquetaSegura = normalizarNombreParaGuardar(etiqueta);
      if (!etiquetaSegura) continue;
      await set(ref(db, `modelo_global/${etiquetaSegura}`), registro);
      completadas++;
      establecerEstadoNube("Subiendo ejemplos...", `Clases sincronizadas: ${completadas} de ${clavesNube.length}.`, "busy");
    }

    establecerEstadoNube("Sincronización completada", `${completadas} clases guardadas en Firebase.`, "");
  } catch (error) {
    console.error("Error sincronizando el modelo con Firebase:", error);
    establecerEstadoNube("No fue posible sincronizar", traducirErrorFirebase(error), "error");
  } finally {
    establecerBotonOcupado(btnSubir, false);
    contarDatosLocales();
  }
}

function traducirErrorFirebase(error) {
  const mensaje = String(error?.message || "").toLowerCase();
  if (mensaje.includes("permission") || mensaje.includes("denied")) {
    return "Firebase rechazó la operación. Revisa las reglas de seguridad de Realtime Database.";
  }
  if (mensaje.includes("network") || mensaje.includes("offline")) {
    return "Comprueba la conexión a internet e inténtalo nuevamente.";
  }
  return "Comprueba la conexión y las reglas de acceso de Firebase. Revisa la consola para más detalles.";
}

btnSubir.addEventListener("click", sincronizarModeloConNube);

async function cargarModeloDeNube({ automatico = false } = {}) {
  establecerBotonOcupado(btnDescargar, true, "Cargando modelo...");
  establecerEstadoNube("Consultando la nube...", "Buscando el modelo guardado en Firebase.", "busy");

  try {
    const dbRef = ref(db);
    const snapshot = await get(child(dbRef, "modelo_global"));
    if (!snapshot.exists() || !snapshot.val() || Object.keys(snapshot.val()).length === 0) {
      establecerEstadoNube("La nube está vacía", "Registra y sincroniza ejemplos para guardar un modelo.", "");
      if (!automatico) establecerEstadoSistema("Sin modelo en la nube", "");
      return;
    }

    const datosNube = snapshot.val();
    const tensores = {};
    const nuevosConteos = {};

    for (const [clave, registro] of Object.entries(datosNube)) {
      if (!registro || !Array.isArray(registro.data) || !Array.isArray(registro.shape)) {
        console.warn(`Se omitió la clase «${clave}» porque tiene un formato de datos inválido.`);
        continue;
      }
      const forma = registro.shape.map(Number);
      const valores = registro.data.map(Number);
      if (forma.length !== 2 || forma.some((n) => !Number.isInteger(n) || n < 1) ||
          valores.length !== forma[0] * forma[1] || valores.some((n) => !Number.isFinite(n))) {
        console.warn(`Se omitió la clase «${clave}» debido a una forma de tensor inconsistente.`);
        continue;
      }
      tensores[clave] = tf.tensor2d(valores, forma);
      nuevosConteos[clave] = forma[0];
    }

    if (Object.keys(tensores).length === 0) {
      establecerEstadoNube("El modelo no contiene datos válidos", "Revisa la estructura del dataset guardado en Firebase.", "error");
      return;
    }

    // Libera el dataset previo para evitar mantener tensores antiguos en memoria.
    const datasetAnterior = classifier.getClassifierDataset();
    Object.values(datasetAnterior).forEach((tensor) => tensor.dispose());
    classifier.setClassifierDataset(tensores);
    exampleCount = nuevosConteos;
    contarDatosLocales();

    establecerEstadoNube("Modelo cargado correctamente", `${Object.keys(tensores).length} señas listas para el reconocimiento.`, "");
    establecerEstadoSistema("Modelo listo para reconocer", "ready");
    if (!isRecording) {
      mostrarResultado("Modelo listo", "Coloca las manos frente a la cámara para probar las señas registradas.");
    }
  } catch (error) {
    console.error("Error descargando el modelo de Firebase:", error);
    establecerEstadoNube("Error al cargar el modelo", traducirErrorFirebase(error), "error");
    if (!automatico) establecerEstadoSistema("No se pudo cargar el modelo", "error");
  } finally {
    establecerBotonOcupado(btnDescargar, false);
  }
}

btnDescargar.addEventListener("click", () => cargarModeloDeNube());

// ==========================================================
// 8. VISIÓN POR COMPUTADORA: PUNTOS DE REFERENCIA DE MANOS
// ==========================================================
function extractKeypoints(results) {
  const lh = new Array(63).fill(0);
  const rh = new Array(63).fill(0);

  if (results.multiHandLandmarks && results.multiHandedness) {
    for (let i = 0; i < results.multiHandLandmarks.length; i++) {
      const landmarks = results.multiHandLandmarks[i];
      const handType = results.multiHandedness[i]?.label;
      const target = handType === "Left" ? lh : handType === "Right" ? rh : null;
      if (!target) continue;

      for (let j = 0; j < landmarks.length; j++) {
        target[j * 3] = Number(landmarks[j].x) || 0;
        target[j * 3 + 1] = Number(landmarks[j].y) || 0;
        target[j * 3 + 2] = Number(landmarks[j].z) || 0;
      }
    }
  }

  // 21 puntos × 3 coordenadas por mano = 126 valores en total.
  return [...lh, ...rh];
}

function resetearCandidata() {
  senaCandidata = "";
  contadorFrames = 0;
}

function procesarPrediccion(result) {
  if (!result || !result.label || !result.confidences) return;
  const confianza = Number(result.confidences[result.label]) || 0;
  actualizarBarraConfianza(confianza);

  if (confianza >= UMBRAL_CONFIANZA) {
    if (result.label === senaCandidata) {
      contadorFrames++;
    } else {
      senaCandidata = result.label;
      contadorFrames = 1;
    }

    if (contadorFrames >= UMBRAL_FRAMES) {
      ultimaSenaReconocida = result.label;
      mostrarResultado(result.label, "Seña reconocida con estabilidad suficiente.");
      actualizarEstadoVozDisponible();

      if (result.label !== ultimaSenaHablada) {
        reproducirVoz(result.label);
        ultimaSenaHablada = result.label;
      }
    } else {
      mostrarResultado(`Detectando: ${result.label}…`, "Mantén la seña estable un momento para confirmar el reconocimiento.");
    }
    establecerEstadoSistema("Reconociendo seña", "ready");
  } else {
    mostrarResultado("Esperando seña…", "Mantén las manos visibles y realiza una seña que ya esté registrada.");
    ultimaSenaHablada = "";
    resetearCandidata();
    actualizarEstadoVozDisponible();
    establecerEstadoSistema("Esperando una seña estable", "");
  }
}

async function onResults(results) {
  // Dibujar el vídeo y la malla de manos con una imagen espejada para que
  // la vista se sienta natural con la cámara frontal. Las coordenadas que
  // recibe el clasificador siguen siendo las originales de MediaPipe.
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.save();
  canvasCtx.translate(canvasElement.width, 0);
  canvasCtx.scale(-1, 1);
  if (results.image) {
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
  }

  const manos = results.multiHandLandmarks || [];
  if (manos.length > 0) {
    for (const landmarks of manos) {
      drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: "#56e3d5", lineWidth: 3 });
      drawLandmarks(canvasCtx, landmarks, { color: "#f3c84d", lineWidth: 1.5, radius: 2 });
    }
  }
  canvasCtx.restore();

  if (manos.length === 0) {
    cameraMessage.classList.remove("is-hidden");
    actualizarBarraConfianza(0);
    if (!isRecording) {
      mostrarResultado("Esperando seña…", "Ubica las manos dentro del encuadre para comenzar.");
      ultimaSenaHablada = "";
      resetearCandidata();
      establecerEstadoSistema(classifier.getNumClasses() > 0 ? "Modelo listo para probar" : "Agrega o carga señas", classifier.getNumClasses() > 0 ? "ready" : "");
      actualizarEstadoVozDisponible();
    }
    return;
  }

  cameraMessage.classList.add("is-hidden");
  establecerEstadoCamara("CÁMARA ACTIVA", "active");

  const keypoints = extractKeypoints(results);
  const tensor = tf.tensor1d(keypoints);
  try {
    if (isRecording && labelToRecord) {
      classifier.addExample(tensor, labelToRecord);
      contarDatosLocales();
      establecerEstadoGrabacion(`Capturando «${labelToRecord}». Ejemplos registrados: ${exampleCount[labelToRecord] || 0}.`, "recording");
      mostrarResultado(`Registrando: ${labelToRecord}`, "Mantén las manos dentro del encuadre mientras se recopilan ejemplos.");
      actualizarBarraConfianza(0);
      return;
    }

    if (classifier.getNumClasses() === 0) {
      mostrarResultado("Modelo sin señas", "Registra una seña o carga el modelo desde la nube para comenzar.");
      establecerEstadoSistema("Modelo sin entrenar", "");
      actualizarBarraConfianza(0);
      return;
    }

    // Evita predicciones simultáneas que podrían acumular trabajo en equipos lentos.
    if (isInferenceRunning) return;
    isInferenceRunning = true;
    try {
      const result = await classifier.predictClass(tensor);
      procesarPrediccion(result);
    } catch (error) {
      console.error("Error al clasificar la seña:", error);
      mostrarResultado("No se pudo clasificar", "Comprueba que el modelo contiene ejemplos válidos.");
      establecerEstadoSistema("Error en el reconocimiento", "error");
    } finally {
      isInferenceRunning = false;
    }
  } catch (error) {
    console.error("Error procesando los puntos de las manos:", error);
  } finally {
    tensor.dispose();
  }
}

// ==========================================================
// 9. INICIALIZACIÓN DE MEDIAPIPE Y CÁMARA
// ==========================================================
async function iniciarCamaraYModeloDeManos() {
  establecerEstadoSistema("Inicializando visión por computadora");
  establecerEstadoCamara("INICIANDO CÁMARA");

  if (typeof Hands === "undefined" || typeof Camera === "undefined") {
    establecerEstadoCamara("MEDIAPIPE NO DISPONIBLE", "error");
    establecerEstadoSistema("No se cargaron las librerías de cámara", "error");
    mostrarResultado("Cámara no disponible", "Verifica la conexión y que las librerías externas puedan cargarse.");
    return;
  }

  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 0,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  hands.onResults(onResults);

  const camera = new Camera(videoElement, {
    onFrame: async () => {
      if (videoElement.readyState >= 2) {
        try {
          await hands.send({ image: videoElement });
        } catch (error) {
          console.error("Error procesando un fotograma de cámara:", error);
        }
      }
    },
    width: 480,
    height: 360,
    facingMode: "user"
  });

  try {
    const inicio = camera.start();
    if (inicio && typeof inicio.then === "function") await inicio;
    cameraStarted = true;
    establecerEstadoCamara("CÁMARA ACTIVA", "active");
    establecerEstadoSistema("Cámara activa", "ready");
  } catch (error) {
    console.error("No fue posible iniciar la cámara:", error);
    establecerEstadoCamara("PERMISO O CÁMARA NO DISPONIBLE", "error");
    establecerEstadoSistema("Revisa el permiso de cámara", "error");
    cameraMessage.classList.remove("is-hidden");
    cameraMessage.querySelector("span:last-child").textContent = "Permite el acceso a la cámara y recarga la página";
    mostrarResultado("No se puede acceder a la cámara", "Usa HTTPS o localhost y acepta el permiso de cámara del navegador.");
  }
}

// ==========================================================
// 10. INICIO DE LA APLICACIÓN
// ==========================================================
async function iniciarAplicacion() {
  contarDatosLocales();
  if (!("speechSynthesis" in window)) {
    establecerEstadoVoz("Este navegador no ofrece síntesis de voz");
  }
  mostrarResultado("Preparando el sistema…", "La cámara y el modelo se están inicializando.");

  // La cámara funciona aunque la base de datos esté vacía; cargar el modelo
  // en paralelo evita mantener bloqueada toda la interfaz.
  iniciarCamaraYModeloDeManos();
  window.setTimeout(() => {
    cargarModeloDeNube({ automatico: true });
  }, 1000);
}

window.addEventListener("beforeunload", () => {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
});

iniciarAplicacion();
