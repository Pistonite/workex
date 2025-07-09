import {
    type WxBusCreator,
    wxFrame,
    wxPopup,
    wxWindowOwner,
    wxWrapHandler,
    logLevel,
} from "@pistonite/workex";

logLevel.debug();

import type { SideA, SideB } from "./proto.ts";
import { multiwindowSideA } from "./interfaces/SideA.bus";
import { multiwindowSideB } from "./interfaces/SideB.bus";

const addMessage = (message: string) => {
    const elem = document.getElementById("div-messages") as HTMLDivElement;
    const p = document.createElement("p");
    p.innerText = message;
    elem.appendChild(p);
};

const main = async () => {
    const params = new URLSearchParams(window.location.search);

    const ownerOrigin = params.get("ownerOrigin") || "";
    if (ownerOrigin) {
        addMessage(`connecting to owner: ${ownerOrigin}`);

        const sideB: SideB = {
            logMessage: wxWrapHandler((message: string) => {
                addMessage(`received from owner: ${message}`);
            }),
        };

        const result = await wxWindowOwner(ownerOrigin)({
            sideA: multiwindowSideA(sideB),
        });

        if (result.err) {
            addMessage(
                `failed to connect to owner: ${JSON.stringify(result.err)}`,
            );
        } else {
            const {
                connection,
                protocols: { sideA },
            } = result.val;
            const divOwnerButtons = document.getElementById(
                "div-owner-buttons",
            ) as HTMLDivElement;
            const closeButton = document.createElement("button");
            closeButton.innerText = "Close";
            closeButton.addEventListener("click", async () => {
                addMessage("closing");
                connection.close();
            });
            divOwnerButtons.appendChild(closeButton);

            const sendButton = document.createElement("button");
            sendButton.innerText = "Send";
            sendButton.addEventListener("click", async () => {
                addMessage("sending to owner");
                const result = await sideA.logMessage("hello hey hey");
                if (result.err) {
                    addMessage(
                        `failed to send to owner: ${JSON.stringify(result.err)}`,
                    );
                } else {
                    addMessage("returned from owner");
                }
            });

            divOwnerButtons.appendChild(sendButton);
        }
    }

    setupDiv("div-popup-same-origin-buttons", "same-origin popup", () =>
        wxPopup(getOpenUrl(true), {
            width: 400,
            height: 800,
        }),
    );

    setupDiv("div-popup-cross-origin-buttons", "cross-origin popup", () =>
        wxPopup(getOpenUrl(false), {
            width: 400,
            height: 800,
        }),
    );

    setupDiv(
        "div-iframe-same-origin-buttons",
        "same-origin iframe",
        (frame) => wxFrame(frame as HTMLIFrameElement),
        () => {
            const frame = document.createElement("iframe");
            frame.height = "800px";
            frame.src = getOpenUrl(true);
            return frame;
        },
    );

    setupDiv(
        "div-iframe-cross-origin-buttons",
        "cross-origin iframe",
        (frame) => wxFrame(frame as HTMLIFrameElement),
        () => {
            const frame = document.createElement("iframe");
            frame.height = "800px";
            frame.src = getOpenUrl(false);
            return frame;
        },
    );
};

const setupDiv = (
    id: string,
    name: string,
    creator: (frame?: HTMLIFrameElement) => WxBusCreator,
    iframe?: () => HTMLIFrameElement,
) => {
    const div = document.getElementById(id) as HTMLDivElement;
    const openButton = document.createElement("button");
    openButton.innerText = "Open";
    openButton.addEventListener("click", async () => {
        addMessage(`opening ${name}`);

        const sideA: SideA = {
            logMessage: wxWrapHandler((message: string) => {
                addMessage(`received from ${name}: ${message}`);
            }),
        };

        const frame = iframe?.();
        if (frame) {
            const divFrames = document.getElementById(
                "div-frames",
            ) as HTMLDivElement;
            divFrames.appendChild(frame);
        }

        const result = await creator(frame)({
            sideB: multiwindowSideB(sideA),
        });

        if (result.err) {
            addMessage(`failed to open ${name}: ${JSON.stringify(result.err)}`);
            return;
        }

        const {
            connection,
            protocols: { sideB },
        } = result.val;

        connection.onClose(() => {
            addMessage(`closed ${name}`);
            closeButton.remove();
            sendButton.remove();
            div.appendChild(openButton);
            frame?.remove();
        });

        openButton.remove();

        const closeButton = document.createElement("button");
        const sendButton = document.createElement("button");

        closeButton.innerText = "Close";
        closeButton.addEventListener("click", async () => {
            addMessage(`closing ${name}`);
            connection.close();
        });

        sendButton.innerText = "Send";
        sendButton.addEventListener("click", async () => {
            addMessage(`sending to ${name}`);
            const result = await sideB.logMessage("hello hey hey");
            if (result.err) {
                addMessage(
                    `failed to send to ${name}: ${JSON.stringify(result.err)}`,
                );
            } else {
                addMessage(`returned from ${name}`);
            }
        });

        div.appendChild(closeButton);
        div.appendChild(sendButton);
    });

    div.appendChild(openButton);
};

const getOpenUrl = (sameOrigin: boolean) => {
    const url = new URL(window.location.href);
    const hostname = window.location.hostname;
    if (url.port === (sameOrigin ? "4000" : "4001")) {
        return `http://${hostname}:4000/index.html?ownerOrigin=${window.location.origin}`;
    }

    return `http://${hostname}:4001/index.html?ownerOrigin=${window.location.origin}`;
};

void main();
