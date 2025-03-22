import { wxWindowOwner, wxWrapHandler } from "@pistonite/workex";
import { SideB } from "./proto";
import { multiwindowSideA } from "./interfaces/SideA.bus";


const addMessage = (message: string) => {
    const elem = document.getElementById("messages") as HTMLDivElement;
    const p = document.createElement("p");
    p.innerText = message;
    elem.appendChild(p);
};

const main = async () => {
    const params = new URLSearchParams(window.location.search);
    const closeButton = document.getElementById("btn-close") as HTMLButtonElement;

    const ownerOrigin = params.get("ownerOrigin") || "";
    if (ownerOrigin) {
        addMessage(`connecting to owner: ${ownerOrigin}`);

        const sideB: SideB = {
            logMessage: wxWrapHandler((message: string) => {
                addMessage(`received from owner: ${message}`);
            })
        };

        const result = await wxWindowOwner(ownerOrigin)({
            sideA: multiwindowSideA(sideB),
        });

        if (result.err) {
            addMessage(`failed to connect to owner: ${JSON.stringify(result.err)}`);
        } else {
        }
    }
};

void main();
