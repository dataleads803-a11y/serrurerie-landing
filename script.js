// ============================================================
//  CONFIGURATION DU SITE
// ============================================================

// ⚠️ VÉRIFIE BIEN QUE TON URL SE TERMINE PAR /exec
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz9Xs5z4WJknjoU5IVQU9oCcUJEv-zTU3u0FXNX7uwJUaymSIm4_lE40uzd6YBN6Evy/exec';

// ⚠️ VÉRIFIE BIEN TA SITE KEY ICI
const RECAPTCHA_SITE_KEY = '6Le4dQ4uAAAAAJrt1NNsnR72gFqNrQOO2ZpGmjs7';

// Ville par défaut si aucune ville n'est trouvée
const DEFAULT_CITY = 'votre ville';

// ============================================================
//  1. GESTION DE LA VILLE (URL OU DÉTECTION AUTOMATIQUE FR)
// ============================================================
async function initCity() {
    const urlParams = new URLSearchParams(window.location.search);
    let cityParam = urlParams.get('ville');
    let finalCity = DEFAULT_CITY;

    // --- CAS 1 : La ville est dans l'URL (Priorité absolue pour Google Ads) ---
    if (cityParam && cityParam.trim() !== '') {
        // On nettoie un peu pour éviter les injections HTML
        cityParam = cityParam.trim().substring(0, 50);
        
        // On met la première lettre en majuscule (ex: "lyon" -> "Lyon")
        finalCity = cityParam.charAt(0).toUpperCase() + cityParam.slice(1);
    } 
    // --- CAS 2 : Pas de ville dans l'URL, on tente la détection par IP ---
    else {
        try {
            const response = await fetch('https://ipapi.co/json/');
            const data = await response.json();
            
            // On vérifie que l'utilisateur est bien en France (code 'FR')
            if (data && data.country_code === 'FR' && data.city) {
                finalCity = data.city.trim();
            }
        } catch (error) {
            console.warn("Détection IP impossible, on garde la ville par défaut.");
        }
    }

    // --- MISE À JOUR DE LA PAGE ---
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
    if (hiddenTimeInput) {
        hiddenTimeInput.value = formLoadedAt;
    }
}

function generateSubmissionId() {
    return 'sub-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// ============================================================
//  3. ENVOI DU FORMULAIRE
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    // On attend que la ville soit détectée avant d'initialiser le reste
    await initCity(); 
    initTimer();

    const form = document.getElementById('lead-form');
    const submitBtn = document.getElementById('submit-btn');
    const statusDiv = document.getElementById('form-status');
    const originalBtnText = submitBtn ? submitBtn.innerHTML : 'Envoyer';

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // --- Vérification Honeypot ---
        const honeypotValue = document.getElementById('website').value;
        if (honeypotValue.trim() !== '') {
            showStatus('Une erreur est survenue. Veuillez réessayer.', 'error');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Envoi en cours...';
        statusDiv.style.display = 'none';

        try {
            // --- reCAPTCHA ---
            const recaptchaToken = await new Promise((resolve, reject) => {
                grecaptcha.ready(() => {
                    grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: 'submit' })
                        .then(resolve).catch(reject);
                });
            });

            // --- Tracking UTM & GCLID ---
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

            // --- Construction des données ---
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

            // --- Envoi ---
            const response = await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.success === true) {
                form.reset();
                form.style.display = 'none';
                showStatus(`✅ Merci ${payload.prenom} ! Votre demande a bien été transmise à ${payload.ville}.`, 'success');
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
