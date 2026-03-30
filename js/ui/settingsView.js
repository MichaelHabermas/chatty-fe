import { resetSettings, sanitizeSettings, saveSettings } from "../config.js";

function createSettingsView(elements, initialSettings, onSettingsChange) {
    const {
        panelEl,
        toggleBtnEl,
        formEl,
        baseUrlEl,
        apiKeyEl,
        streamEnabledEl,
        webSearchModeEl,
        resetBtnEl,
    } = elements;

    let settings = { ...initialSettings };

    function fillForm(values) {
        baseUrlEl.value = values.baseUrl;
        apiKeyEl.value = values.apiKey;
        streamEnabledEl.checked = values.streamEnabled;
        webSearchModeEl.value = values.webSearchMode;
    }

    function togglePanel() {
        const shouldOpen = panelEl.hidden;
        panelEl.hidden = !shouldOpen;
        toggleBtnEl.setAttribute("aria-expanded", String(shouldOpen));
    }

    function closePanel() {
        panelEl.hidden = true;
        toggleBtnEl.setAttribute("aria-expanded", "false");
    }

    toggleBtnEl.addEventListener("click", togglePanel);

    formEl.addEventListener("submit", (event) => {
        event.preventDefault();
        settings = saveSettings(
            sanitizeSettings({
                baseUrl: baseUrlEl.value,
                apiKey: apiKeyEl.value,
                streamEnabled: streamEnabledEl.checked,
                webSearchMode: webSearchModeEl.value,
            }),
        );
        fillForm(settings);
        closePanel();
        onSettingsChange(settings);
    });

    resetBtnEl.addEventListener("click", () => {
        settings = resetSettings();
        fillForm(settings);
        closePanel();
        onSettingsChange(settings);
    });

    fillForm(settings);

    return {
        getSettings() {
            return settings;
        },
    };
}

export { createSettingsView };
