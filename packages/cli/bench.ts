function benchmark(label: string, func: (index: number) => void, indices: number[]) {
    const iterations = indices.length;
    const start = performance.now();
    for (let j = 0; j < 1000; j++) {
    for (let i = 0; i < iterations; i++) {
        func(indices[i]);
    }
    }
    const end = performance.now();
    console.log(`${label}: ${(end - start).toFixed(2)} ms`);
}

// Generate random indices upfront
const iterations = 1_000_000;
const indices3 = Array.from({ length: iterations }, () => Math.floor(Math.random() * 3));
const indices30 = Array.from({ length: iterations }, () => Math.floor(Math.random() * 30));

// Case 1: Switch with 3 functions
function switchTest3(index: number) {
    switch (index) {
        case 0: return "Function A";
        case 1: return "Function B";
        case 2: return "Function C";
        default: return "Default";
    }
}

// Case 2: Array of functions with 3 elements
const functionArray3 = [
    () => "Function A",
    () => "Function B",
    () => "Function C",
];
const functionArray3Pre = functionArray3.map(f => f());

function arrayTest3(index: number) {
    return functionArray3[index]();
}

// Case 3: Switch with 30 functions
function switchTest30(index: number) {
    switch (index) {
        case 0: return "Function 0";
        case 1: return "Function 1";
        case 2: return "Function 2";
        case 3: return "Function 3";
        case 4: return "Function 4";
        case 5: return "Function 5";
        case 6: return "Function 6";
        case 7: return "Function 7";
        case 8: return "Function 8";
        case 9: return "Function 9";
        case 10: return "Function 10";
        case 11: return "Function 11";
        case 12: return "Function 12";
        case 13: return "Function 13";
        case 14: return "Function 14";
        case 15: return "Function 15";
        case 16: return "Function 16";
        case 17: return "Function 17";
        case 18: return "Function 18";
        case 19: return "Function 19";
        case 20: return "Function 20";
        case 21: return "Function 21";
        case 22: return "Function 22";
        case 23: return "Function 23";
        case 24: return "Function 24";
        case 25: return "Function 25";
        case 26: return "Function 26";
        case 27: return "Function 27";
        case 28: return "Function 28";
        case 29: return "Function 29";
        default: return "Default";
    }
}

// Case 4: Array of functions with 30 elements
const functionArray30 = Array.from({ length: 30 }, (_, i) => () => `Function ${i}`);
const functionArray30Pre = functionArray30.map(f => f());

function arrayTest30(index: number) {
    return functionArray30[index]();
}

// Main function to run benchmarks
function main() {
    console.log("Benchmarking...");
    benchmark("Switch (3 functions)", switchTest3, indices3);
    benchmark("Array (3 functions)", arrayTest3, indices3);
    benchmark("Switch (30 functions)", switchTest30, indices30);
    benchmark("Array (30 functions)", arrayTest30, indices30);
}

main();
