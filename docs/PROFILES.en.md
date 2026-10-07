# Native Homey profiles and experimental settings

Version 0.1.13. Open the main Anker Charger device → Settings → Advanced settings.

The Experimental features group provides Maximum Compatibility, custom profile enablement and Charging Device Identification. These settings are shared with your Anker account. Identification requires Maximum Compatibility off. Recognized model names are still available only in the original Anker app; their MQTT fields have not been decoded.

The Anker profile editor manages four cloud slots independently of the active charging mode:

1. Select a slot and **Load selected profile**, save Homey's settings, wait a couple of seconds and reopen the settings. Empty slots are initialized from the charger's stored custom limits and protocols.
2. Edit the name, auto exit and limits. USB-C uses 5 W steps; C1 supports up to 140 W, C2–C4 up to 100 W. A1+A2 share 0, 15 or 24 W. The combined budget cannot exceed 250 W. Zero is allowed in stored profiles.
3. Choose **Save profile to Anker** and save Homey's settings. This updates the selected slot or creates it when empty. Existing protocol flags are preserved. Saving does not change the active charging mode.
4. Choose **Apply saved profile** and save to activate the cloud profile. Unsaved editor fields are not applied. Custom profiles must be enabled first.
5. **Delete selected profile** removes it from Anker without a second confirmation. **Refresh from Anker** refreshes switches and the profile list while preserving your editor draft.

After an action, the dropdown returns to Edit fields only. This choice saves a local editor draft without changing the charger. Load a slot before editing it; avoid editing different slots simultaneously in multiple Homey clients. Legacy USB-C limits not divisible by 5 can be preserved unchanged. Individual protocol flag editing is not included. Existing mode controls and individual port controls are not duplicated in advanced settings.

Validation: 20 automated tests and Homey publish validation passed. Live tests through Homey created, updated, loaded and deleted a temporary cloud profile and disabled/restored identification. The original Test profile remained intact. Profile activation was checked at the MQTT encoding/confirmation level; active charging was not switched for this installation test.
