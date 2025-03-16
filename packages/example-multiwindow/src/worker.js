console.log("worker");
globalThis.addEventListener("message", ({data}) => {
    console.log(data);
});
