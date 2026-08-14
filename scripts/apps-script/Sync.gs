/**
 * PageFly Design — push the allowlist sheet into the app.
 *
 * Lives in the spreadsheet, not on our server, which is the point: the sheet
 * holds merchant email addresses, and this way it never has to be shared with a
 * service account or published to the web to be readable. The script already
 * runs as someone who can see it.
 *
 * ---------------------------------------------------------------------------
 * SETUP (once)
 *
 * 1. In the sheet: Extensions > Apps Script. Paste this file over Code.gs.
 *
 * 2. Project Settings > Script properties > Add script property:
 *
 *        ENDPOINT   https://pagefly-design.pagefly.io/api/admin/sync
 *        SECRET     <the same value as SYNC_SECRET on the server>
 *        TAB        User Testing
 *
 *    The secret goes in script properties rather than in this code, so that
 *    anyone given edit access to the sheet does not thereby get a key that can
 *    write to the app.
 *
 * 3. Run `installTriggers` once. Approve the permission prompt — it asks for
 *    external network access, which is the POST below.
 *
 * 4. Run `syncNow` once by hand and check the Execution log.
 * ---------------------------------------------------------------------------
 */

function props_() {
  return PropertiesService.getScriptProperties();
}

function config_() {
  const p = props_();
  const endpoint = p.getProperty('ENDPOINT');
  const secret = p.getProperty('SECRET');
  if (!endpoint || !secret) {
    throw new Error('Set ENDPOINT and SECRET in Project Settings > Script properties.');
  }
  return { endpoint: endpoint, secret: secret, tab: p.getProperty('TAB') || 'User Testing' };
}

/**
 * Read the tab and POST it.
 *
 * Sends display values rather than raw values: a date cell arrives as the text
 * the operator sees instead of a serial number, and every column the app reads
 * is text anyway.
 */
function syncNow() {
  const cfg = config_();

  const sheet = SpreadsheetApp.getActive().getSheetByName(cfg.tab);
  if (!sheet) throw new Error('No tab named "' + cfg.tab + '" in this spreadsheet.');

  // Trailing blank rows are hundreds of empty arrays the server would parse and
  // discard; dropping them here keeps the request small.
  const rows = sheet
    .getDataRange()
    .getDisplayValues()
    .filter(function (r) {
      return r.some(function (c) {
        return String(c).trim() !== '';
      });
    });

  if (rows.length < 2) {
    Logger.log('Nothing to send: %s has %s row(s).', cfg.tab, rows.length);
    return;
  }

  /* Skip the POST when nothing changed. The time trigger fires every ten
     minutes whether or not anyone touched the sheet, and a sync that rewrites
     every store row on an unchanged sheet is a write nobody asked for. */
  const stamp = Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(rows))
  );
  if (stamp === props_().getProperty('LAST_STAMP')) {
    Logger.log('Unchanged since the last sync — nothing sent.');
    return;
  }

  const res = UrlFetchApp.fetch(cfg.endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-sync-secret': cfg.secret },
    payload: JSON.stringify({ rows: rows }),
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  const body = res.getContentText();

  if (code !== 200) {
    /* Deliberately not caught. A failed sync has to surface as a failed
       execution, because that is what Apps Script emails about — swallowed, the
       sheet would drift out of the app silently for weeks. */
    throw new Error('Sync failed (' + code + '): ' + body);
  }

  // Only after a confirmed 200, so a failure retries on the next trigger.
  props_().setProperty('LAST_STAMP', stamp);
  Logger.log('Synced %s data row(s). Server said: %s', rows.length - 1, body);
}

/**
 * Install both triggers, replacing any this script installed before.
 *
 * TWO of them, and both are needed:
 *
 * - onChange fires when a person edits the sheet. Instant, but it does NOT fire
 *   for rows written through the Sheets API by another program. If this sheet is
 *   filled by an automation, this trigger will never see those rows.
 * - A ten-minute timer is what actually catches API-written rows. It is the
 *   reliable one; onChange is the one that makes a manual edit feel instant.
 */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncNow') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('syncNow')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onChange()
    .create();

  ScriptApp.newTrigger('syncNow').timeBased().everyMinutes(10).create();

  Logger.log('Installed: onChange + every 10 minutes.');
}

/** Forget the change stamp, so the next run sends even if nothing changed. */
function forceNextSync() {
  props_().deleteProperty('LAST_STAMP');
  Logger.log('Next run will send.');
}
