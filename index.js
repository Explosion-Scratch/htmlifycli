import fs from "fs";
import fetch from "cross-fetch";
import "colors";
import inquirer from "inquirer";
import logUpdate from "log-update";
import { join } from "path";
import Packager from "@turbowarp/packager";
console.clear();

(async () => {
  log = throttle(trycatch(log), 100);
  const CURRENT = {
    logInterval: null,
    status: "Waiting for user input",
    projects: {},
  };
  const _slist = {
    id: "A single project from an ID",
    studio: "From a studio",
    user: "From a user's projects",
  };
  let source = await inquirer.prompt([
    {
      name: "source",
      type: "list",
      choices: Object.values(_slist),
      default: _slist.user,
    },
  ]);
  source = Object.entries(_slist).find(([key, val]) => val == source.source)[0];

  const sources = {
    user: [
      {
        type: "input",
        name: "user",
        message: "What user's projects would you like to download?",
        default: "griffpatch",
      },
      {
        type: "number",
        name: "limit",
        message: "What number of projects should be maximum?",
        default: 100,
      },
    ],
    studio: [
      {
        type: "number",
        name: "id",
        message:
          "What is the studio ID of the studio you want to download projects from?",
        default: 28381459,
      },
      {
        type: "number",
        name: "limit",
        message: "What number of projects should be maximum?",
        default: 100,
      },
    ],
    id: [
      {
        type: "number",
        name: "id",
        default: 60917032,
        message: "What's the project ID of the project?",
      },
    ],
  };

  const sourceOptions = await inquirer.prompt([
    ...sources[source],
    { type: "number", name: "limit", default: 100, message: "Project limit" },
    { name: "target", type: "list", choices: ["zip", "html"], default: "html" },
  ]);

  const features = {
    turbo: "Turbo mode",
    highQualityPen: "High quality pen?",
    fencing: "Fence sprites?",
    miscLimits: "Miscellaneous limits",
    autoplay: "Autoplay",
    loadingBar: "Show loading progress",
    compilerEnable: "Enable compiler",
    interpolation: "Interpolation",
  };
  const buttons = {
    greenFlag: "Green flag",
    stopAll: "Stop all",
    fullscreen: "Fullscreen",
    pause: "Pause",
  };
  let projectPrompt = [
    {
      type: "input",
      name: "folder",
      message: "Folder to save projects in (will be created if non-existant)",
      default: sourceOptions.user || "projects",
    },
    {
      type: "number",
      name: "framerate",
      message: "What frame rate should the project(s) run at? ",
      default: 30,
    },
    {
      name: "stageWidth",
      message: "Stage width",
      default: 480,
      type: "number",
    },
    {
      name: "stageHeight",
      message: "Stage height",
      default: 360,
      type: "number",
    },
    {
      name: "username",
      message: "Username",
      default: "player##",
    },
    {
      name: "maxClones",
      message: "Maximum clones",
      default: 1000,
      type: "number",
    },
    {
      type: "checkbox",
      name: "features",
      message: "What do you want enabled?",
      choices: Object.values(features),
      default: [
        features.compilerEnable,
        features.loadingBar,
        features.fencing,
        features.interpolation,
        features.miscLimits,
        features.autoplay,
        features.highQualityPen,
      ],
    },
    {
      type: "checkbox",
      name: "buttons",
      message: "What buttons do you want to enable?",
      choices: Object.values(buttons),
      default: [buttons.pause, buttons.fullscreen],
    },
  ];

  const { customize } = await inquirer.prompt([
    {
      name: "customize",
      message: "Customize the default settings?",
      type: "confirm",
      default: false,
    },
  ]);

  const projectOptions = customize
    ? await inquirer.prompt(projectPrompt)
    : Object.fromEntries(projectPrompt.map((i) => [i.name, i.default]));

  const opts = { source, sourceOptions, projectOptions };
  CURRENT.logInterval = setInterval(log, 50);
  CURRENT.status = "Fetching projects";
  log();
  let projects = await (async () => {
    if (opts.source === "id") {
      return [
        await fetch(
          `https://api.scratch.mit.edu/projects/${opts.sourceOptions.id}`
        ).then((res) => res.json()),
      ];
    } else {
      let out = [];
      let current = { length: 20 };
      let i = 0;
      while (current.length >= 20 && out.length < opts.sourceOptions.limit) {
        CURRENT.status = `Getting page ${i}` /*.brightBlue*/;
        let url = {
          user: () => `users/${opts.sourceOptions.user}/projects?`,
          studio: () => `studios/${opts.sourceOptions.id}/projects/?limit=20&`,
          id: () => `projects/${opts.sourceOptions.id}`,
        };
        current = await fetch(
          `https://api.scratch.mit.edu/${url[opts.source]()}offset=${20 * i++}`
        ).then((res) => res.json());
        out.push(...current);
      }
      return out.slice(0, opts.sourceOptions.limit);
    }
  })();
  CURRENT.projects = Object.fromEntries(
    projects.map((i) => [i.id, "Fetching".brightBlue])
  );
  log();
  let folder = opts.projectOptions.folder.replace(/\/$/, "");
  CURRENT.status = "Creating folder";
  log();
  fs.mkdirSync(folder, { recursive: true });
  CURRENT.status = "Getting projects";
  log();
  let projectPromises = [];
  for (let i in projects) {
    projectPromises.push(
      (async () => {
        let project = projects[i];
        CURRENT.projects[project.id] = "Fetching".yellow;
        let ab = await (
          await fetch(`https://projects.scratch.mit.edu/${project.id}`)
        ).arrayBuffer();
        let formattedTitle = project.title.replace(/[/\\?%*:|"<>]/g, "-");
        const name = join(folder, formattedTitle);
        if (fs.existsSync(name)) {
          CURRENT.projects[project.id] =
            `File already exists (${project.title.brightBlue})`.brightYellow;
          log();
        }
        CURRENT.projects[project.id] = "Loading project".brightBlue;
        log();
        let loaded = await Packager.loadProject(ab, (type, a, b) => {
          CURRENT.projects[project.id] = `${`[${type}]`.yellow} ${
            typeof a === "string"
              ? a
              : a <= 1
              ? `${~~(a * 100)}%`.brightGreen
              : `${a} assets downloaded`.brightBlue
          }`;
        });
        CURRENT.projects[project.id] = "Packaging".brightBlue;
        log();
        const packager = new Packager.Packager(loaded);
        let f = Object.fromEntries(
          Object.entries(features).map(([k, v]) => [
            k,
            projectOptions.features.includes(v),
          ])
        );
        let btns = Object.fromEntries(
          Object.entries(buttons).map(([k, v]) => [
            k,
            { enabled: projectOptions.buttons.includes(v) },
          ])
        );
        f = {
          loadingScreen: {
            progressBar: f.loadingBar,
            text: project.title,
          },
          compiler: {
            enabled: f.compilerEnable,
          },
          ...f,
          target: sourceOptions.target,
          ...projectOptions,
          app: {
            icon: null,
            packageName: formattedTitle,
            windowTitle: formattedTitle,
            windowMode: "window",
          },
          controls: {
            ...btns,
          },
        };
        Object.assign(packager.options, f);
        packager.project = loaded;
        const { type, data } = await packager.package();
        if (data instanceof ArrayBuffer) {
          data = new Uint8Array(data);
        }
        CURRENT.projects[project.id] = "Writing file".green;
        log();
        fs.writeFileSync(`${name}.${type.split("/")[1]}`, data);
        CURRENT.projects[project.id] = "Finished".green;
        log();
      })()
    );
  }

  Promise.all(projectPromises).then(
    (p) => (
      (projects = p),
      (CURRENT.status = "Finished"),
      logUpdate(`✅ ${`Finished`.green}`),
      process.exit(0)
    )
  );

  function log() {
    // Change every 10 seconds
    const SPINNER_INDEX = ~~(Date.now() / 10000);
    let spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let earthSpinner = ["🌍 ", "🌎 ", "🌏 "]
      .map((i) => new Array(4).fill(i))
      .flat();
    let dotsSpinner2 = ["⢄", "⢂", "⢁", "⡁", "⡈", "⡐", "⡠"];
    let runnerSpinner = ["🚶 ", "🏃 "].map((i) => new Array(4).fill(i)).flat();
    let weatherSpinner = [
      "☀️ ",
      "☀️ ",
      "☀️ ",
      "🌤 ",
      "⛅️ ",
      "🌥 ",
      "☁️ ",
      "🌧 ",
      "🌨 ",
      "🌧 ",
      "🌨 ",
      "🌧 ",
      "🌨 ",
      "⛈ ",
      "🌨 ",
      "🌧 ",
      "🌨 ",
      "☁️ ",
      "🌥 ",
      "⛅️ ",
      "🌤 ",
      "☀️ ",
      "☀️ ",
    ]
      .map((i) => new Array(2).fill(i))
      .flat();
    let arrowSpinner = ["⬆️ ", "↗️ ", "➡️ ", "↘️ ", "⬇️ ", "↙️ ", "⬅️ ", "↖️ "];
    let clockSpinner = [
      "🕛 ",
      "🕐 ",
      "🕑 ",
      "🕒 ",
      "🕓 ",
      "🕔 ",
      "🕕 ",
      "🕖 ",
      "🕗 ",
      "🕘 ",
      "🕙 ",
      "🕚 ",
    ];

    let spinners = [
      spinner,
      weatherSpinner,
      arrowSpinner,
      clockSpinner,
      earthSpinner,
      runnerSpinner,
      dotsSpinner2,
    ];
    spinner = spinners[SPINNER_INDEX % spinners.length];
    spinner = `${spinner[Math.floor(Date.now() / 50) % spinner.length]}`;
    if (Object.entries(CURRENT.projects).length) {
      CURRENT.status = `Downloading projects ${
        `[${
          Object.values(CURRENT.projects).filter((i) => i.includes("Finished"))
            .length
        }/${Object.keys(CURRENT.projects).length}]`.yellow
      }`;
    }

    let logThis = `${spinner} ${CURRENT.status}`.yellow;

    if (Object.entries(CURRENT.projects).length) {
      logThis += "\n\n";
      let newlog = Object.entries(CURRENT.projects)
        .sort((a, b) => {
          // Get IDs
          a = a[0];
          b = b[0];
          a = projects.find((i) => i.id == a).title;
          b = projects.find((i) => i.id == b).title;
          // Alphabetically
          return a.localeCompare(b);
        })
        .filter((i) => !i[1].includes("Fetching") && !i[1].includes("0%"))
        .slice(0, 10)
        .map(
          ([k, v]) =>
            `${
              `[${niceslice(projects.find((i) => i.id == k).title)}]`.padEnd(
                40,
                " "
              ).yellow
            }\t${v}`
        )
        .join("\n");
      if (newlog.trim().length) {
        logThis += newlog;
      } else {
        logThis += `\nNo projects currently downloading`.yellow;
      }
    }

    logUpdate(logThis);
  }
})();

function trycatch(fn) {
  return (...a) => {
    try {
      fn(...a);
    } catch (e) {
      console.clear();
      console.error(e);
      process.exit(1);
    }
  };
}
function throttle(callback, limit) {
  var waiting = false; // Initially, we're not waiting
  return function () {
    // We return a throttled function
    if (!waiting) {
      // If we're not waiting
      callback.apply(this, arguments); // Execute users function
      waiting = true; // Prevent future invocations
      setTimeout(function () {
        // After a period of time
        waiting = false; // And allow future invocations
      }, limit);
    }
  };
}
function niceslice(str, len = 30) {
  return str.length >= len ? str.slice(0, len - 3) + "..." : str;
}
