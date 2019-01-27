// Modules to control application life and create native browser window
const { app, BrowserWindow, dialog, Notification } = require("electron");
const gitP = require("simple-git/promise");
const log = require("electron-log");
const Store = require("electron-store");
const URL = require("url");
const store = new Store();

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

function getQueryStringValue(query, key) {
  const value = query[key];
  if (value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

// See https://www.kernel.org/pub/software/scm/git/docs/git-check-ref-format.html
// ASCII Control chars and space, DEL, ~ ^ : ? * [ \
// | " < and > is technically a valid refname but not on Windows
// the magic sequence @{, consecutive dots, leading and trailing dot, ref ending in .lock
const invalidCharacterRegex = /[\x00-\x20\x7F~^:?*\[\\|""<>]+|@{|\.\.+|^\.|\.$|\.lock$|\/$/g;

function testForInvalidChars(name) {
  return invalidCharacterRegex.test(name);
}

//x-github-client://openRepo/https://github.com/DankNeon/meta?branch=wuz-new-colors
const processUrl = url => {
  const parsedURL = URL.parse(url, true);
  const hostname = parsedURL.hostname;
  const unknown = { name: "unknown", url };
  if (!hostname) {
    return unknown;
  }

  const query = parsedURL.query;

  const actionName = hostname.toLowerCase();
  if (actionName === "oauth") {
    const code = getQueryStringValue(query, "code");
    const state = getQueryStringValue(query, "state");
    if (code != null && state != null) {
      return { name: "oauth", code, state };
    } else {
      return unknown;
    }
  }

  // we require something resembling a URL first
  // - bail out if it's not defined
  // - bail out if you only have `/`
  const pathName = parsedURL.pathname;
  if (!pathName || pathName.length <= 1) {
    return unknown;
  }

  // Trim the trailing / from the URL
  const parsedPath = pathName.substr(1);

  if (actionName === "openrepo") {
    const pr = getQueryStringValue(query, "pr");
    const branch = getQueryStringValue(query, "branch");
    const filepath = getQueryStringValue(query, "filepath");

    if (pr != null) {
      if (!/^\d+$/.test(pr)) {
        return unknown;
      }

      // we also expect the branch for a forked PR to be a given ref format
      if (branch != null && !/^pr\/\d+$/.test(branch)) {
        return unknown;
      }
    }

    if (branch != null && testForInvalidChars(branch)) {
      return unknown;
    }

    return {
      name: "open-repository-from-url",
      url: parsedPath,
      branch,
      pr,
      filepath
    };
  }

  if (actionName === "openlocalrepo") {
    return {
      name: "open-repository-from-path",
      path: decodeURIComponent(parsedPath)
    };
  }

  return unknown;
};

const getRepo = repoPath => gitP(require("path").resolve(repoPath));

const checkoutPR = (repo, branchName) => repo.checkout(branchName);
const showSetLocalDialog = url =>
  new Promise((resolve, reject) => {
    dialog.showOpenDialog({ properties: ["openDirectory"] }, files => {
      if (files.length === 0) reject("No file selected...");
      const localLocation = files[0];
      store.set(url, localLocation);
      resolve(localLocation);
    });
  });

app.setAsDefaultProtocolClient("x-github-client");
app.on("will-finish-launching", () => {
  app.on("open-url", async (event, url) => {
    event.preventDefault();
    const parsed = processUrl(url);
    const repoName = parsed.url.replace("https://github.com/", "");
    const { branch } = parsed;
    let repoLocation = store.get(repoName);
    if (!repoLocation) {
      repoLocation = await showSetLocalDialog(repoName);
    }
    const repo = await getRepo(repoLocation);
    try {
      await checkoutPR(repo, branch);
    } catch (err) {
      let notif = new Notification({
        body: err.message
      });
      notif.show();
    }
    let notif = new Notification({
      title: "Checked out branch",
      body: `${branch} on ${repoName}`
    });
    notif.show();
  });
});

function startApp() {
  log.info("starting");
  // Create the browser window.
  mainWindow = new BrowserWindow({ width: 200, height: 100 });

  // and load the index.html of the app.
  mainWindow.loadFile("index.html");

  // Emitted when the window is closed.
  mainWindow.on("closed", function() {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", startApp);

// Quit when all windows are closed.
app.on("window-all-closed", function() {
  app.quit();
});
