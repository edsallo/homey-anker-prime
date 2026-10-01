# Install from scratch — no development experience needed

[Русский](INSTALL.ru.md) · [App features](../README.md)

You will install an unofficial app directly onto your own Homey Pro. It is not yet available as a one-click Homey App Store installation. Allow roughly 20–40 minutes for a first attempt. A terminal is simply a window in which you paste the commands below; you do not need to write code.

## 1. Check what you need

- An Anker **A2345**, already working over Wi-Fi in the Anker app. Check the model on the charger; similar-looking chargers are not automatically compatible.
- Homey Pro with **13.5.0 or newer** firmware. Find the version in Homey's system/about information. This release was tested on Homey Pro (2023).
- Access to the Homey account that can install apps on that Homey.
- Your own Anker email/password and account region/country. These are different from your Homey login.
- A Windows or macOS computer with internet access. Connect it to the same normal home network as Homey for the simplest setup; avoid a guest network.

Homey Cloud or a Homey Bridge alone is insufficient. You do not need a paid GitHub account, Git, Docker, an SSH connection or a developer API key. The computer can be switched off after installation.

## 2. Install Node.js

Open [the official Node.js download page](https://nodejs.org/en/download), choose an **LTS version 24 or newer**, and run the installer for your operating system. Keep the default npm component enabled. Restart your terminal after installation.

Open a terminal:

- **Windows:** open Start, type **Command Prompt**, and open it. Using Command Prompt avoids the PowerShell `npm.ps1` execution-policy issue.
- **macOS:** press Command–Space, type **Terminal**, and open it.

Run one line at a time, pressing Enter after each:

```sh
node --version
npm --version
```

Both commands should print version numbers. `node` should start with `v24` or a newer major version. If either command is not found, finish/reinstall Node.js and open a new terminal before continuing.

## 3. Download and extract the application

1. Open the [latest GitHub release](https://github.com/edsallo/homey-anker-prime/releases/latest).
2. Download **Source code (zip)** in the Assets section. You do not need the `.tar.gz` build archive.
3. Extract the ZIP: on Windows use **Extract All**; on macOS double-click the ZIP.
4. Open the extracted folder. The correct folder contains **app.json**, **package.json**, **package-lock.json**, and a **scripts** folder. If you see another single folder, open that one.

Do not run commands from inside the ZIP viewer. You do not need a GitHub login just to download a public release.

## 4. Open the terminal in that folder

**Windows:** open the extracted project folder in File Explorer, click its address bar, type `cmd`, then press Enter. A Command Prompt opens in that folder.

**macOS:** in Terminal type `cd ` (with a trailing space), drag the extracted project folder from Finder into Terminal, and press Enter. Drag the folder, not `app.json`.

Confirm the directory:

- Windows: type `dir` and press Enter.
- macOS: type `ls` and press Enter.

You should see `app.json` and `package.json`. If not, correct the folder before proceeding.

## 5. Download the required tools

```sh
npm ci
```

Wait until the ordinary command prompt returns. This downloads the project's locked dependencies, including the official Homey CLI, into this folder. It can take several minutes. It does not ask for your Anker password and does not install the charger on Homey yet.

Deprecation or audit warnings from developer-tool dependencies are not, by themselves, an installation failure. A line beginning `npm ERR!` / `npm error` needs attention. Do not run `npm audit fix --force` as a workaround: it can change the tested tool versions.

## 6. Sign into Homey and choose the correct hub

```sh
npm run homey -- login
```

Follow the browser login opened by the official CLI. Use your **Homey/Athom account**, not your Anker account. If the browser does not open automatically, follow the URL/instructions printed by the CLI. Return to the terminal after authorization completes.

Then run:

```sh
npm run homey -- select
```

Choose your Homey Pro using the arrow keys and Enter when prompted. If you own several Homeys, double-check the selected name. The next step installs on that selected Homey.

## 7. Install the app permanently

```sh
npm run install:homey
```

The utility builds and validates the app, then uploads it. Wait for a message beginning **Installed Anker 0.1.8** (or the version you downloaded). You may now close Terminal/Command Prompt. This installation runs on Homey and does not depend on your computer staying awake.

The helper uses a buffered upload because the standard CLI upload returned `Missing File` in our tested setup. It preserves existing device/user data. It uses the authorization from step 6; it does not ask you to paste a Homey token.

For users already familiar with the CLI, `npm run homey -- app install` is the standard alternative. Do not use `app run` for this permanent installation, and do not add `--clean`: that option deletes existing app data. See the [official Homey CLI reference](https://apps.developer.homey.app/the-basics/getting-started/homey-cli) for the difference between install and run.

## 8. Add the charger in the Homey phone app

1. Open Homey and go to **Devices → + / Add device**.
2. Find **Anker**, then **Prime 250W · A2345**.
3. Choose your Anker account region (**Europe** or **Global**) and the two-letter country code associated with that account. The form defaults to Europe/DE; change it if your account uses another region/country. This is not the language of your phone.
4. Enter **your Anker email and password** in Homey's login form. Do not edit code or enter these credentials in the terminal.
5. Select the discovered charger, choose a room/zone, and finish pairing.
6. Allow a short time for live values to arrive. Open the device card. Native Homey controls let you choose a charging mode or a port; the readings tab shows total power and that port's W/V/A.

If no A2345 appears, first confirm it is visible in the Anker app under the same account. Then check the selected region and country. Signing into Homey successfully does not sign you into Anker.

## 9. Optional individual ports and advanced settings

To get separate port tiles, repeat **Add device → Anker → USB ports (optional)**. Select C1–C4 or A1+A2 as needed; another Anker login is not required. A1 and A2 share power control. Keep the main charger paired.

Open the main charger's gear/settings menu → **Advanced settings** for display brightness, nine stock themes, display timeout, encoder direction, USB-C priorities, clock format and clock schedule. Save the changes and wait for confirmation. Charging mode/port selection are already in the main card and are not duplicated here.

The optional **Anker Prime widget** is added separately through Homey's home-screen/dashboard editor. You do not need it to use the device card or individual ports.

## Updates, repair and removal

**Update:** download a newer release ZIP and extract it to a new folder. Open a terminal there, run `npm ci`, check the selected Homey with `npm run homey -- select`, then run `npm run install:homey`. Log in again only if requested. Do not uninstall the old app or use `--clean`; the same app ID updates the existing app and normally retains devices/settings. Updates here are manual, not automatic App Store updates.

**Changed Anker password:** open the main device's settings/repair or reconnect function and enter the new Anker credentials. Do not delete all devices merely to change the password.

**Remove:** uninstall Anker through Homey's app settings. This removes the integration and can affect paired devices and Flows; it does not factory-reset the charger. Removing the downloaded project folder from your computer does not uninstall the running Homey app. You can log the local CLI out with `npm run homey -- logout` before deleting the project tools.

## Troubleshooting

| Symptom | What to do |
|---|---|
| `node` / `npm` not recognized | Install Node.js with npm, then open a fresh terminal. |
| PowerShell says scripts are disabled | Use Command Prompt as above, or invoke `npm.cmd` instead of `npm`. Do not disable system security globally. |
| `ENOENT` / package.json not found | You are in the wrong folder or still inside a ZIP. Extract it and locate package.json. |
| `EACCES` / permission denied | Extract into a normal user-owned folder such as Downloads, not a protected system directory. These steps do not require global npm installation or `sudo`. |
| Login expired or no Homey selected | Repeat `npm run homey -- login`, then `npm run homey -- select`. |
| `Missing File` | Use `npm run install:homey`, the included buffered-upload helper. |
| Cannot reach Homey | Check power/network, use the same non-guest network, and verify the selected hub. |
| App not visible immediately | Close/reopen Homey; check its Apps list and whether installation actually finished successfully. |
| Charger unavailable / command not confirmed | Check Anker connectivity and internet access, wait for fresh data, and inspect actual state before retrying. |
| Old card layout after updating | Close the device card and reopen it; restart the Homey phone app if necessary. |
| Port watts differ from voltage × current | These are the charger's separately reported readings, sampled/rounded by its firmware; this app does not replace them with a calculation. |

Still stuck? [Open an issue](https://github.com/edsallo/homey-anker-prime/issues) with OS, Node version, Homey version, app version and the error text. Redact passwords, account email, device serials and tokens. Never upload the app's private account file or a CLI authorization file.

The project installer was tested on macOS. Windows steps have not yet been verified on physical Windows hardware. Official background: [Homey getting started](https://apps.developer.homey.app/the-basics/getting-started), [Homey CLI](https://apps.developer.homey.app/the-basics/getting-started/homey-cli), [Node.js downloads](https://nodejs.org/en/download).
