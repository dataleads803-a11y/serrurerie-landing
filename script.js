// ============================================================
//  CONFIGURATION DU SITE
// ============================================================
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz9Xs5z4WJknjoU5IVQU9oCcUJEv-zTU3u0FXNX7uwJUaymSIm4_lE40uzd6YBN6Evy/exec';
const RECAPTCHA_SITE_KEY = '6Le4dQ4uAAAAAJrt1NNsnR72gFqNrQOO2ZpGmjs7';

const ALLOWED_CITIES = ['Montpellier', 'Nîmes', 'Béziers', 'Sète', 'Narbonne'];
const DEFAULT_CITY = 'votre ville';

// ============================================================
//  1. GESTION DE LA VILLE (URL OU DÉTECTION AUTOMATIQUE)
// ============================================================
async function initCity() {
    const urlParams = new URLSearchParams(window.location.search);
    let cityParam = urlParams.get('ville');
    let finalCity = DEFAULT_CITY;

    // CAS 1 : La ville est dans l'URL (Priorité absolue)
    if (cityParam) {
        cityParam = cityParam.trim();
        const matchedCity = ALLOWED_CITIES.find(c => c.toLowerCase() === cityParam.toLowerCase());
        if (matchedCity) {
            finalCity = matchedCity;
        }
    } 
    // CAS 2 : Pas de ville dans l'URL, on tente la détection par IP
    else {
        try {
            const response = await fetch('https://ipapi.co/json/');
            const data = await response.json();
            
            console.log("L'API IP a détecté :", data.city); // Pour le debug

            if (data && data.city) {
                // Pour ce test, on accepte la ville détectée quoi qu'il arrive
                finalCity = data.city.trim();
            }
        } catch (error) {
            console.warn("Détection IP impossible", error);
        }
    }

    // Mise à jour de la page
    document.querySelectorAll('.city-name').forEach(el => {
        el.textContent = finalCity;
    });

    const hiddenVilleInput = document.getElementById('hidden-ville');
    if (hiddenVilleInput) {
        hiddenVilleInput.value = finalCity;
    }
    document.title = `Serrurier à ${finalCity} - Demande gratuite`;
}

// ============================================================
//  2. SUIVI DU TEMPS ET DE L'ID DE SOUMISSION
// ============================================================
let formLoadedAt;
function initTimer() {
    formLoadedAt = Date.now();
    const hiddenTimeInput = document.getElementById('form-loaded-at');
    if (hiddenTimeInput) hiddenTimeInput.value = formLoadedAt;
}
function generateSubmissionId() {
    return 'sub-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// ============================================================
//  3. ENVOI DU FORMULAIRE
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    // ⚠️ AJOUT DE "await" ICI pour être sûr que la ville est détectée AVANT tout
    await initCity(); 
    initTimer();

    const form = document.getElementById('lead-form');
    const submitBtn = document.getElementById('submit-btn');
    const statusDiv = document.getElementById('form-status');
    const originalBtnText = submitBtn ? submitBtn.innerHTML : 'Envoyer';

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const honeypotValue = document.getElementById('website').value;
        if (honeypotValue.trim() !== '') {
            showStatus('Une erreur est survenue. Veuillez réessayer.', 'error');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Envoi en cours...';
        statusDiv.style.display = 'none';

        try {
            const recaptchaToken = await new Promise((resolve, reject) => {
                grecaptcha.ready(() => {
                    grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: 'submit' }).then(resolve).catch(reject);
                });
            });

            const urlParams = new URLSearchParams(window.location.search);
            const trackingData = {
                gclid: urlParams.get('gclid') || '',
                gbraid: urlParams.get('gbraid') || '',
                wbraid: urlParams.get('wbraid') || '',
                utm_source: urlParams.get('utm_source') || '',
                utm_medium: urlParams.get('utm_medium') || '',
                utm_campaign: urlParams.get('utm_campaign') || '',
                utm_term: urlParams.get('utm_term') || '',
                utm_content: urlParams.get('utm_content') || ''
            };

            const formData = new FormData(form);
            const payload = {
                prenom: formData.get('prenom'),
                telephone: formData.get('telephone'),
                probleme: formData.get('probleme'),
                logement: formData.get('logement'),
                codePostal: formData.get('codePostal'),
                ville: formData.get('ville'),
                consent: formData.get('consent') === 'on' ? true : false,
                honeypot: honeypotValue,
                formLoadedAt: formLoadedAt,
                submissionId: generateSubmissionId(),
                recaptchaToken: recaptchaToken,
                pageUrl: window.location.href,
                ...trackingData
            };

            const response = await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.success === true) {
                form.reset();
                form.style.display = 'none';
                showStatus(`✅ Merci ${payload.prenom} ! Votre demande a bien été transmise.`, 'success');
            } else {
                console.error('Erreur backend:', result);
                showStatus('Une erreur est survenue lors de l\'envoi.', 'error');
                resetButton();
            }
        } catch (error) {
            console.error('Erreur réseau:', error);
            showStatus('Impossible de contacter le serveur.', 'error');
            resetButton();
        }
    });

    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = `form-status status-${type}`;
        statusDiv.style.display = 'block';
        statusDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function resetButton() {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
});
