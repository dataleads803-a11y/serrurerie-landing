
// ============================================================
//  CONFIGURATION DU SITE
// ============================================================

// ⚠️ COLLE TON URL D'APPLICATION WEB GOOGLE APPS SCRIPT ICI
// (Celle qui se termine par /exec, récupérée au Bloc 5)
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz9Xs5z4WJknjoU5IVQU9oCcUJEv-zTU3u0FXNX7uwJUaymSIm4_lE40uzd6YBN6Evy/exec';

// ⚠️ COLLE TA CLÉ PUBLIQUE (SITE KEY) RECAPTCHA ICI
const RECAPTCHA_SITE_KEY = '6Le4dQ4uAAAAAJrt1NNsnR72gFqNrQOO2ZpGmjs7';

// Liste des villes autorisées (tu peux en ajouter d'autres)
const ALLOWED_CITIES = ['Montpellier', 'Nîmes', 'Béziers', 'Sète', 'Narbonne'];

// Ville par défaut si aucune ville valide n'est trouvée dans l'URL
const DEFAULT_CITY = 'votre ville';

// ============================================================
//  1. GESTION DE LA VILLE DYNAMIQUE
// ============================================================
function initCity() {
    const urlParams = new URLSearchParams(window.location.search);
    let cityParam = urlParams.get('ville');
    let finalCity = DEFAULT_CITY;

    if (cityParam) {
        // Nettoyage basique de la valeur reçue
        cityParam = cityParam.trim();
        
        // Vérification que la ville est bien dans notre liste autorisée
        // (insensible à la casse pour éviter les erreurs d'URL)
        const matchedCity = ALLOWED_CITIES.find(
            c => c.toLowerCase() === cityParam.toLowerCase()
        );

        if (matchedCity) {
            finalCity = matchedCity;
        }
    }

    // Mise à jour des textes sur la page (H1, sous-titres, boutons)
    document.querySelectorAll('.city-name').forEach(el => {
        el.textContent = finalCity;
    });

    // Mise à jour du champ caché du formulaire
    const hiddenVilleInput = document.getElementById('hidden-ville');
    if (hiddenVilleInput) {
        hiddenVilleInput.value = finalCity;
    }

    // Mise à jour du titre de la page (SEO)
    document.title = `Serrurier à ${finalCity} - Demande gratuite`;
}

// ============================================================
//  2. SUIVI DU TEMPS ET DE L'ID DE SOUMISSION
// ============================================================
let formLoadedAt;

function initTimer() {
    // On enregistre l'heure d'arrivée sur la page
    formLoadedAt = Date.now();
    const hiddenTimeInput = document.getElementById('form-loaded-at');
    if (hiddenTimeInput) {
        hiddenTimeInput.value = formLoadedAt;
    }
}

// Génère un ID unique pour éviter les doubles soumissions
function generateSubmissionId() {
    return 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ============================================================
//  3. ENVOI DU FORMULAIRE
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initCity();
    initTimer();

    const form = document.getElementById('lead-form');
    const submitBtn = document.getElementById('submit-btn');
    const statusDiv = document.getElementById('form-status');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault(); // Empêche le rechargement de la page

        // --- A. Vérification Honeypot (Anti-bot) ---
        const honeypotValue = document.getElementById('website').value;
        if (honeypotValue.trim() !== '') {
            // C'est un robot, on fait semblant que tout va bien mais on n'envoie rien
            showStatus('Une erreur est survenue. Veuillez réessayer.', 'error');
            return;
        }

        // --- B. Préparation de l'interface (Chargement) ---
        submitBtn.disabled = true;
        const originalBtnText = submitBtn.textContent;
        submitBtn.textContent = 'Envoi en cours...';
        statusDiv.style.display = 'none';

        try {
            // --- C. Génération du token reCAPTCHA v3 ---
            const recaptchaToken = await new Promise((resolve, reject) => {
                grecaptcha.ready(() => {
                    grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: 'submit' })
                        .then(resolve)
                        .catch(reject);
                });
            });

            // --- D. Récupération des paramètres de tracking (Google Ads) ---
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

            // --- E. Construction des données à envoyer ---
            const formData = new FormData(form);
            const payload = {
                prenom: formData.get('prenom'),
                telephone: formData.get('telephone'),
                probleme: formData.get('probleme'),
                logement: formData.get('logement'),
                codePostal: formData.get('codePostal'),
                ville: formData.get('ville'), // Rempli par initCity()
                consent: formData.get('consent') === 'on' ? true : false,
                
                // Sécurité
                honeypot: honeypotValue,
                formLoadedAt: formLoadedAt,
                submissionId: generateSubmissionId(),
                recaptchaToken: recaptchaToken,
                
                // Tracking
                pageUrl: window.location.href,
                ...trackingData
            };

            // --- F. Envoi vers Google Apps Script ---
            // Note : On utilise text/plain pour éviter les problèmes de CORS avec Apps Script
            const response = await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8',
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            // --- G. Traitement de la réponse ---
            if (result.success === true) {
                // Succès : on cache le formulaire et on affiche le message
                form.reset();
                form.style.display = 'none';
                showStatus(`✅ Merci ${payload.prenom} ! Votre demande a bien été transmise. Un professionnel vous contactera rapidement.`, 'success');
            } else {
                // Erreur serveur (ex: captcha score trop bas, champ manquant)
                console.error('Erreur backend:', result);
                showStatus('Une erreur est survenue lors de l\'envoi. Vérifiez vos informations et réessayez.', 'error');
                resetButton();
            }

        } catch (error) {
            console.error('Erreur réseau:', error);
            showStatus('Impossible de contacter le serveur. Vérifiez votre connexion internet.', 'error');
            resetButton();
        }
    });

    // Fonction utilitaire pour afficher les messages
    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = `form-status status-${type}`;
        statusDiv.style.display = 'block';
        statusDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Fonction pour réactiver le bouton en cas d'erreur
    function resetButton() {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
    }
});
