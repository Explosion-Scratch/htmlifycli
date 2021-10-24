import fs from "fs";
import Htmlifier from "@sheeptester/htmlifier";
import fetch from "node-fetch";
import colors from "colors";
import inquirer from "inquirer";
import logUpdate from 'log-update';

(async () => {
	const buttons = {
		startStop: "Start and stop buttons",
		fullscreen: "Fullscreen button",
		download: "Download as .sb3 button",
		addSprite: "Upload .sprite3 sprite to project",
	};
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
                      message: "What is the studio ID of the studio you want to download projects from?",
                      default: 28381459,
                  },
                  {
                      type: "number",
                      name: "limit",
                      message: "What number of projects should be maximum?",
                      default: 100,
                  },
              ],
              id: [{type: "number", name: "id", default: 60917032, message: "What's the project ID of the project?"}]
          }
    const projectOptions = [
		{
			type: "input",
			name: "folder",
			message: "Folder to save projects in (will be created if non-existant)",
			default: "projects",
		},
		{
			type: "confirm",
			message: "Log output to console?",
			name: "log",
			default: true,
		},
		{
			type: "number",
			name: "fps",
			message: "Frames per second to run projects at",
			default: 30,
		},
		{
			type: "confirm",
			name: "turbo",
			message: "Use turbo mode?",
			default: false,
		},
		{
			type: "input",
			name: "username",
			message: "Username to use in the username block",
			default: "explosion_fan_lol",
		},
		{
			type: "confirm",
			name: "autoStart",
			message: "Autostart project?",
			default: true,
		},
		{
			type: "confirm",
			name: "pointerLock",
			message: "Lock mouse cursor?",
			default: false,
		},
		{
			type: "confirm",
			name: "includeVm",
			message:
				"Bundle the VM that runs scratch projects inside the HTML file. (requires internet to load project if false)",
			default: true,
		},
		{
			type: "confirm",
			name: "limits",
			message: "Add limits such as clone limits to the project",
			default: false,
		},
		{
			type: "confirm",
			name: "fencing",
			message: "Fence sprites into the stage area (default scratch does this)",
			default: true,
		},
		{
			type: "confirm",
			name: "zip",
			message:
				"Make a .zip file with all assets instead of packing everything in a single HTML file?",
			default: false,
		},
		{
			type: "checkbox",
			name: "buttons",
			choices: Object.values(buttons),
			message: "What buttons do you want to show up?",
		},
	]
    const _slist = {
        id: "A single project from an ID",
        studio: "From a studio",
        user: "From a user's projects",
    }
    let source = await inquirer.prompt([{name: "source", type: "list", choices: Object.values(_slist), default: _slist.user}]);
    source = Object.entries(_slist).find(([key, val]) => val == source.source)[0];
    const sourceOptions = await inquirer.prompt(sources[source]);
    const _projectOptions = await inquirer.prompt(projectOptions);
	const options = {source, ...sourceOptions, ..._projectOptions};
	if (!options.log) {
		console.log = () => {};
		console.error = () => {};
        logUpdate = () => {};
	}
	const projects = await (async () => {
        if (options.source === "id"){
            logUpdate("Getting project".brightBlue);
            return [await fetch(`https://api.scratch.mit.edu/projects/${options.id}`).then(res => res.json())];
        } else {
            let out = [];
            let current = { length: 20 };
            let i = 0;
            while (current.length >= 20 && out.length < options.limit) {
                logUpdate(`Getting page ${i}`.brightBlue);
                let url = {
                    user: () => `users/${options.user}/projects?`,
                    studio: () => `studios/${options.id}/projects/?limit=20&`,
                }
                current = await fetch(
                    `https://api.scratch.mit.edu/${url[options.source]()}offset=${
                        20 * i++
                    }`
                ).then((res) => res.json());
                out.push(...current);
            }
            return out.slice(0, options.limit);
        }
	})();
	console.log(`Got ${projects.length} projects.`.brightBlue);
	let folder = options.folder.replace(/\/$/, "");
	fs.mkdirSync(folder, { recursive: true });
	for (let i in projects) {
		let project = projects[i];
		const name = `${folder}/${project.title.replace(/[/\\?%*:|"<>]/g, "-")}`;
		if (fs.existsSync(name)) {
			console.log(`[${project.id}] File already exists (${project.title.brightBlue})`.brightYellow);
			continue;
		}
		let title = `${`[${i}/${projects.length}]`.yellow} ${project.title}`;
		logUpdate(title);
		try {
			const html = await new Htmlifier()
				.htmlify(
					{ type: "id", id: project.id.toString() },
					{
						pointerLock: options.pointerLock,
						username: options.username,
						autoStart: options.autoStart,
						turbo: options.turbo,
						title: project.title,
						includeVm: options.includeVm,
						log: (msg) => logUpdate(`${`[${project.id}]`.brightYellow}: ${`[${project.title}]`.brightYellow} ${msg.gray}`),
						buttons: {
							startStop: options.buttons.includes(buttons.startStop),
							fullscreen: options.buttons.includes(buttons.fullscreen),
							download: options.buttons.includes(buttons.download),
							addSprite: options.buttons.includes(buttons.addSprite),
						},
						loading: { progressbar: "white" },
						fps: options.fps,
						limits: options.limits,
						fencing: options.fencing,
					}
				)
				.then((blob) => blob.text());
			logUpdate(`${`[${project.id}]`.brightYellow}: Created html`.brightBlue);
			fs.writeFileSync(`${name}.${options.zip ? "zip" : "html"}`, html);
			logUpdate(
				`${`[${project.id}]`.brightYellow}: Wrote ${options.zip ? "zip" : "html"} to ${
					`${name}.${options.zip ? "zip" : "html"}`.yellow
				}`.brightBlue
			);
            logUpdate(`${`[${project.id}]`.brightYellow}: ${project.title.brightBlue} finished`);
            console.log("");
		} catch (e) {
			logUpdate(`${`[${project.id}]`.brightYellow}: Error while downloading ${project.title.brightBlue} (${e.message.toString().brightRed})`);
            console.log("");
			continue;
		}
	}
})();
