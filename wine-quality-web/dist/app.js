const featureOrder = [
  "alcohol",
  "pH",
  "residual sugar",
  "chlorides",
  "fixed acidity",
  "volatile acidity",
  "citric acid",
  "free sulfur dioxide",
  "total sulfur dioxide",
  "density",
  "sulphates",
  "type_white",
];

const defaults = {
  type: "red",
  "fixed acidity": 7.0,
  "volatile acidity": 0.29,
  "citric acid": 0.31,
  "residual sugar": 3.0,
  chlorides: 0.047,
  "free sulfur dioxide": 29,
  "total sulfur dioxide": 118,
  sulphates: 0.51,
  density: 0.9949,
  pH: 3.21,
  alcohol: 10.3,
};

const scenarios = {
  medium: defaults,
  good: {
    type: "red",
    "fixed acidity": 7.9,
    "volatile acidity": 0.35,
    "citric acid": 0.46,
    "residual sugar": 3.6,
    chlorides: 0.078,
    "free sulfur dioxide": 15,
    "total sulfur dioxide": 37,
    sulphates: 0.86,
    density: 0.9973,
    pH: 3.35,
    alcohol: 12.8,
  },
  bad: {
    type: "red",
    "fixed acidity": 7.4,
    "volatile acidity": 0.59,
    "citric acid": 0.08,
    "residual sugar": 4.4,
    chlorides: 0.086,
    "free sulfur dioxide": 6,
    "total sulfur dioxide": 29,
    sulphates: 0.5,
    density: 0.9974,
    pH: 3.38,
    alcohol: 9.0,
  },
  warning: {
    ...defaults,
    "volatile acidity": 1.8,
    alcohol: 7.2,
  },
};

const form = document.querySelector("#wine-form");
const submitButton = form.querySelector(".primary-button");
const submitLabel = submitButton.querySelector("span");
const resultPanel = document.querySelector("#result");
const inputs = [...form.querySelectorAll('input[type="number"]')];

let trainingRows = [];
let means = [];
let scales = [];

function prepareModel(payload) {
  const exportedOrder = payload.preprocessing.feature_order;
  if (JSON.stringify(exportedOrder) !== JSON.stringify(featureOrder)) {
    throw new Error("incompatible feature order");
  }
  means = payload.preprocessing.means;
  scales = payload.preprocessing.scales;
  trainingRows = payload.training.vectors.map((vector, index) => ({
    label: payload.training.labels[index],
    vector,
  }));
}

function formValues() {
  const values = {};
  for (const input of inputs) values[input.name] = Number(input.value);
  values.type = form.elements.type.value;
  return values;
}

function predictionVector(values) {
  const raw = featureOrder.map((feature) => {
    if (feature === "type_white") return values.type === "white" ? 1 : 0;
    return Number(values[feature]);
  });
  return raw.map((value, index) => (value - means[index]) / scales[index]);
}

function predict(values) {
  const vector = predictionVector(values);
  const nearest = trainingRows
    .map((row) => {
      const squaredDistance = row.vector.reduce((sum, value, index) => sum + (value - vector[index]) ** 2, 0);
      return { label: row.label, distance: Math.sqrt(squaredDistance) };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);

  const scores = { Ruim: 0, Médio: 0, Bom: 0 };
  for (const neighbor of nearest) {
    scores[neighbor.label] += neighbor.distance === 0 ? 1_000_000 : 1 / neighbor.distance;
  }
  const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
  const probabilities = Object.fromEntries(Object.entries(scores).map(([label, score]) => [label, (score / total) * 100]));
  const predicted = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0];
  return { predicted, probabilities };
}

function validateForm() {
  let firstInvalid = null;
  const selectedType = form.querySelector('input[name="type"]:checked');
  const wineType = form.querySelector(".wine-type");
  wineType.classList.toggle("invalid", !selectedType);
  if (!selectedType) firstInvalid = form.querySelector('input[name="type"]');

  for (const input of inputs) {
    const wrapper = input.closest(".input-wrap");
    const valid = input.value !== "" && Number(input.value) >= Number(input.min) && Number(input.value) <= Number(input.max);
    wrapper.classList.toggle("invalid", !valid);
    input.setAttribute("aria-invalid", String(!valid));
    if (!valid && !firstInvalid) firstInvalid = input;
  }
  firstInvalid?.focus();
  return !firstInvalid;
}

function renderResult({ predicted, probabilities }) {
  const ordered = ["Ruim", "Médio", "Bom"];
  const confidence = probabilities[predicted];
  resultPanel.innerHTML = `
    <div class="result-content">
      <div class="result-kicker">Classificação estimada</div>
      <h2 class="result-class">${predicted}</h2>
      <p class="confidence">Confiança ponderada entre os 3 vinhos mais próximos: <strong>${confidence.toFixed(1)}%</strong></p>
      <div class="probabilities" aria-label="Probabilidades estimadas por classe">
        ${ordered.map((label) => `
          <div class="prob-row">
            <span>${label}</span>
            <div class="prob-track"><span style="width:${probabilities[label].toFixed(2)}%"></span></div>
            <strong>${probabilities[label].toFixed(1)}%</strong>
          </div>
        `).join("")}
      </div>
    </div>`;
  resultPanel.scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderValidationError() {
  resultPanel.innerHTML = `
    <div class="result-placeholder">
      <span class="result-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M12 3 2.7 20h18.6L12 3ZM12 9v5M12 18h.01"/></svg>
      </span>
      <h2>Revise os valores informados</h2>
      <p>Os campos destacados estão fora das faixas observadas no dataset ou não foram preenchidos.</p>
    </div>`;
}

function setScenario(values) {
  for (const [name, value] of Object.entries(values)) {
    if (name === "type") {
      form.querySelector(`input[name="type"][value="${value}"]`).checked = true;
      continue;
    }
    form.elements[name].value = value;
  }
  inputs.forEach((input) => input.closest(".input-wrap").classList.remove("invalid"));
}

document.querySelectorAll("[data-scenario]").forEach((button) => {
  button.addEventListener("click", () => {
    setScenario(scenarios[button.dataset.scenario]);
    if (button.dataset.scenario === "warning") {
      validateForm();
      renderValidationError();
    }
  });
});

inputs.forEach((input) => {
  input.addEventListener("input", () => input.closest(".input-wrap").classList.remove("invalid"));
});

form.querySelectorAll('input[name="type"]').forEach((input) => {
  input.addEventListener("change", () => form.querySelector(".wine-type").classList.remove("invalid"));
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!validateForm()) {
    renderValidationError();
    return;
  }
  renderResult(predict(formValues()));
});

form.addEventListener("reset", () => {
  requestAnimationFrame(() => {
    inputs.forEach((input) => input.closest(".input-wrap").classList.remove("invalid"));
    form.querySelector(".wine-type").classList.remove("invalid");
    resultPanel.innerHTML = `
      <div class="result-placeholder">
        <span class="result-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="m3 17 5-6 4 3 5-8 4 3M14 18a4 4 0 1 0 8 0 4 4 0 0 0-8 0ZM21 21l2 2"/></svg>
        </span>
        <h2>Pronto para inferência</h2>
        <p>O resultado da classificação será apresentado aqui após submeter os parâmetros físico-químicos.</p>
      </div>`;
  });
});

fetch("./data/model.json")
  .then((response) => {
    if (!response.ok) throw new Error("model unavailable");
    return response.json();
  })
  .then((payload) => {
    prepareModel(payload);
    submitButton.disabled = false;
    submitLabel.textContent = "Classificar qualidade";
  })
  .catch(() => {
    submitLabel.textContent = "Modelo indisponível";
    resultPanel.innerHTML = `
      <div class="result-placeholder">
        <span class="result-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 3 2.7 20h18.6L12 3ZM12 9v5M12 18h.01"/></svg>
        </span>
        <h2>Não foi possível carregar o modelo</h2>
        <p>Atualize a página para tentar novamente.</p>
      </div>`;
  });
