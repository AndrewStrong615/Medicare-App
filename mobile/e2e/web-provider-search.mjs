/**
 * End-to-end check of "Find a provider" in a real browser.
 *
 * Not part of `npm test`. It drives an actual Chrome against an actual backend
 * and the live NPPES directory, because the things it is checking cannot be
 * observed in jsdom or in devtools' responsive mode:
 *
 *   - whether the browser's Geolocation API is reachable at all (it is gated
 *     on a secure context, which jsdom does not model),
 *   - what happens when permission is granted, denied, or never answered,
 *   - whether a coordinate really does come back as a ZIP and then as
 *     providers.
 *
 * Usage:
 *
 *     # 1. backend
 *     cd backend && uvicorn app.main:app --port 8000
 *     # 2. build and run
 *     cd mobile && npx expo export --platform web
 *     node e2e/web-provider-search.mjs
 *
 * It serves the exported build from http://localhost:8090 - deliberately not
 * 8081, which is Expo's own dev-server port. localhost is a secure context by
 * definition, which is what makes geolocation work here without a TLS
 * certificate; that is *not* true of a LAN address like http://192.168.x.x,
 * where browsers refuse geolocation outright.
 *
 * If the port is already taken the run aborts rather than starting. An earlier
 * version did not, silently attached to whatever was already listening, and
 * spent a full run testing a different build than the one it had just made.
 */

import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright-core";

const APP_PORT = Number(process.env.E2E_APP_PORT ?? 8090);
const APP_ORIGIN = `http://localhost:${APP_PORT}`;
const API_ORIGIN = process.env.E2E_API_ORIGIN ?? "http://localhost:8000";
const CHROME =
  process.env.CHROME_PATH ??
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// Empire State Building. A real coordinate, so the ZIP it resolves to and the
// providers it returns are real too.
const NEW_YORK = { latitude: 40.7484, longitude: -73.9857 };

// Set to this machine's LAN address to also check the secure-context rule,
// e.g. E2E_LAN_HOST=192.168.1.5. Skipped when unset.
const LAN_HOST = process.env.E2E_LAN_HOST ?? null;

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function waitForServer(url, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

/** Sign up through the API so the UI walk starts from a known account. */
async function makeAccount() {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "e2e-password-123";
  const response = await fetch(`${API_ORIGIN}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (response.status !== 201) {
    throw new Error(`signup failed: ${response.status} ${await response.text()}`);
  }
  return { email, password };
}

async function signIn(page, account) {
  await page.goto(APP_ORIGIN, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByText("MedHelp provides general information only").waitFor({
    timeout: 20_000,
  });
}

async function openProviderSearch(page) {
  await page.getByRole("button", { name: /My Appointments/i }).click();
  await page.getByRole("button", { name: "Find a provider" }).click();
  await page.getByLabel("ZIP code").waitFor({ timeout: 20_000 });
}

/**
 * Kill the static server and everything it spawned.
 *
 * `shell: true` on Windows puts a cmd.exe between us and node, and killing the
 * shell orphans the server - which then sits on the port and quietly serves a
 * stale build to the next run. `taskkill /T` takes the whole tree.
 */
function stop(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    child.kill("SIGTERM");
  }
}

/** Refuse to run against something we did not start. */
async function portIsFree(port) {
  try {
    await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(1500) });
    return false;
  } catch {
    return true;
  }
}

async function run() {
  if (!(await portIsFree(APP_PORT))) {
    throw new Error(
      `Something is already serving http://localhost:${APP_PORT}. ` +
        `Refusing to run, because the results would describe that server and ` +
        `not the build in ./dist. Stop it, or set E2E_APP_PORT.`
    );
  }

  const app = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["serve", "dist", "-l", String(APP_PORT), "--single"],
    { stdio: "ignore", shell: process.platform === "win32" }
  );

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  try {
    if (!(await waitForServer(APP_ORIGIN))) throw new Error("app server never came up");
    if (!(await waitForServer(`${API_ORIGIN}/health`))) throw new Error("backend not running");

    const account = await makeAccount();

    // ---------------------------------------------------------------- granted
    {
      const context = await browser.newContext({
        permissions: ["geolocation"],
        geolocation: NEW_YORK,
        locale: "en-US",
      });
      const page = await context.newPage();
      const requests = [];
      page.on("request", (request) => requests.push(request));

      await signIn(page, account);
      await openProviderSearch(page);

      const zip = page.getByLabel("ZIP code");
      check(
        "granted: no button needed, the ZIP fills itself in",
        (await page.getByRole("button", { name: "Use my location" }).count()) === 0,
        ""
      );
      await page
        .waitForFunction(
          () => {
            const field = document.querySelector('input[aria-label="ZIP code"]');
            return field && /^\d{5}$/.test(field.value);
          },
          { timeout: 20_000 }
        )
        .catch(() => {});
      const prefilled = await zip.inputValue();
      check(
        "granted: ZIP is filled in from the browser's position",
        /^\d{5}$/.test(prefilled),
        `got "${prefilled}"`
      );

      const resolve = requests.find((r) => r.url().includes("/providers/resolve-location"));
      check(
        "granted: the coordinate goes to our own backend, by POST",
        Boolean(resolve) && resolve.method() === "POST",
        resolve ? `${resolve.method()} ${resolve.url()}` : "no resolve call seen"
      );
      check(
        "granted: no coordinate appears in any URL",
        !requests.some((r) => /40\.74|73\.98/.test(r.url())),
        ""
      );
      check(
        "granted: no third-party geocoder is contacted",
        !requests.some((r) =>
          /googleapis|mapbox|here\.com|tomtom|geocod/i.test(r.url())
        ),
        ""
      );
      check(
        "granted: no scary location notice is shown",
        !(await page.getByText(/couldn't work out|doesn't have permission/i).count()),
        ""
      );

      await page.getByRole("button", { name: "Search" }).click();
      const heading = page.getByText(/\d+ providers?$/);
      await heading.waitFor({ timeout: 40_000 });
      const headingText = await heading.textContent();
      check("granted: real providers come back", /\d+ provider/.test(headingText), headingText);

      const distance = await page.getByText(/^~[\d.]+ mi$/).count();
      check("granted: distances are shown, marked as estimates", distance > 0, `${distance} rows`);

      // People look for "a hospital". Until this existed the list offered only
      // physician specialties, so that search was simply not possible.
      await page.getByRole("radio", { name: "Hospital" }).click();
      await page.getByRole("button", { name: "Search" }).click();
      const hospitals = page.getByText(/\d+ providers?$/);
      await hospitals.waitFor({ timeout: 40_000 });
      check(
        "granted: hospitals are searchable",
        /\d+ provider/.test(await hospitals.textContent()),
        await hospitals.textContent()
      );

      await context.close();
    }

    // ----------------------------------------------------------------- denied
    {
      // No permission granted: Chrome auto-denies rather than prompting, which
      // is the same code path (PERMISSION_DENIED) a real refusal takes.
      const context = await browser.newContext({ locale: "en-US" });
      await context.clearPermissions();
      const page = await context.newPage();

      await signIn(page, account);
      await openProviderSearch(page);

      // Nothing has been asked yet, so the app offers the button rather than
      // announcing a failure that has not happened.
      const button = page.getByRole("button", { name: "Use my location" });
      await button.waitFor({ timeout: 20_000 });
      check("denied: the ask is offered before anything is claimed", true, "");

      // Chrome refuses without a prompt when the site has no permission,
      // which is the same PERMISSION_DENIED path a real refusal takes.
      await button.click();
      const notice = page.getByText(/location is blocked for this site/i);
      await notice.waitFor({ timeout: 20_000 });
      check("denied: the user is told why, and how to unblock it", true, "");
      check(
        "denied: the ask stays offered, so unblocking works without a reload",
        (await button.count()) === 1,
        ""
      );

      const zip = page.getByLabel("ZIP code");
      check("denied: ZIP is left empty for the user", (await zip.inputValue()) === "", "");

      // The fallback has to be a complete path, not a consolation prize.
      await zip.fill("90210");
      await page.getByRole("button", { name: "Search" }).click();
      const heading = page.getByText(/\d+ providers?$/);
      await heading.waitFor({ timeout: 40_000 });
      check(
        "denied: typing a ZIP still finds providers",
        /\d+ provider/.test(await heading.textContent()),
        await heading.textContent()
      );
      const distance = await page.getByText(/^~[\d.]+ mi$/).count();
      check(
        "denied: distances still shown (they come from the API, not the device)",
        distance > 0,
        `${distance} rows`
      );

      await context.close();
    }

    // -------------------------------------------------- never asked (prompt)
    {
      // The bug behind "I never get prompted". The app used to fire a
      // permission request on mount, with no user gesture. Browsers suppress
      // that, and a site already blocked never prompts again - so nothing was
      // ever shown and there was no way to try again from inside the app.
      //
      // Chrome headless has no "prompt" state to offer, so the Permissions API
      // is stubbed to report one. Everything below it is the real code path:
      // the real button, the real getCurrentPosition call, the real backend.
      const context = await browser.newContext({
        permissions: ["geolocation"],
        geolocation: NEW_YORK,
        locale: "en-US",
      });
      await context.addInitScript(() => {
        window.__geo = { calls: 0 };
        const real = navigator.geolocation.getCurrentPosition.bind(
          navigator.geolocation
        );
        navigator.geolocation.getCurrentPosition = (ok, err, options) => {
          window.__geo.calls += 1;
          return real(ok, err, options);
        };
        navigator.permissions.query = async () => ({
          state: "prompt",
          addEventListener() {},
          removeEventListener() {},
        });
      });

      const page = await context.newPage();
      await signIn(page, account);
      await openProviderSearch(page);
      await page.waitForTimeout(1500);

      check(
        "never asked: nothing is requested on arrival",
        (await page.evaluate(() => window.__geo.calls)) === 0,
        ""
      );
      check(
        "never asked: no failure notice, because nothing has failed",
        (await page.getByText(/blocked for this site|couldn't work out/i).count()) === 0,
        ""
      );

      const button = page.getByRole("button", { name: "Use my location" });
      check("never asked: a button is offered instead", (await button.count()) === 1, "");

      await button.click();
      await page.waitForFunction(
        () => {
          const field = document.querySelector('input[aria-label="ZIP code"]');
          return field && /^\d{5}$/.test(field.value);
        },
        { timeout: 20_000 }
      );
      const filled = await page.getByLabel("ZIP code").inputValue();
      check(
        "never asked: pressing it really does ask, and fills the ZIP in",
        /^\d{5}$/.test(filled) &&
          (await page.evaluate(() => window.__geo.calls)) === 1,
        `ZIP ${filled}`
      );

      await page.getByRole("button", { name: "Search" }).click();
      const heading = page.getByText(/\d+ providers?$/);
      await heading.waitFor({ timeout: 40_000 });
      check(
        "never asked: providers render after location is obtained",
        /\d+ provider/.test(await heading.textContent()),
        await heading.textContent()
      );

      await context.close();
    }

    // ------------------------------------------------ served over plain http
    if (LAN_HOST) {
      // The HTTPS requirement, checked rather than assumed. Browsers only
      // expose the Geolocation API in a secure context: https, or localhost.
      // Serving the web build to a phone at http://192.168.x.x - which is how
      // you run this without an Apple developer account - is neither, so the
      // API is unavailable no matter what the user would have chosen.
      const context = await browser.newContext({
        permissions: ["geolocation"],
        geolocation: NEW_YORK,
        locale: "en-US",
      });
      const page = await context.newPage();
      const lanOrigin = `http://${LAN_HOST}:${APP_PORT}`;

      await page.goto(lanOrigin, { waitUntil: "domcontentloaded" });
      const secure = await page.evaluate(() => window.isSecureContext);
      check("plain http on a LAN address is not a secure context", secure === false, "");

      const blocked = await page.evaluate(
        () =>
          new Promise((resolve) => {
            if (!navigator.geolocation) return resolve("no api");
            navigator.geolocation.getCurrentPosition(
              () => resolve("granted"),
              (error) => resolve(`error ${error.code}`)
            );
            setTimeout(() => resolve("no answer"), 4000);
          })
      );
      check(
        "the browser refuses to geolocate it, even with permission granted",
        blocked !== "granted",
        String(blocked)
      );

      await context.close();
    }

    // ------------------------------------------------------- empty ZIP guard
    {
      const context = await browser.newContext({ locale: "en-US" });
      await context.clearPermissions();
      const page = await context.newPage();
      await signIn(page, account);
      await openProviderSearch(page);

      await page.getByRole("button", { name: "Search" }).click();
      await page.getByText("Enter a 5-digit ZIP code.").waitFor({ timeout: 10_000 });
      check("no location yet: searching empty says what to do", true, "");
      await context.close();
    }
  } finally {
    await browser.close();
    stop(app);
  }

  const failed = results.filter((r) => !r.passed);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed in real Chrome.`
  );
  return failed.length === 0 ? 0 : 1;
}

run().then(
  (code) => process.exit(code),
  (error) => {
    console.error("e2e run failed:", error);
    process.exit(1);
  }
);
