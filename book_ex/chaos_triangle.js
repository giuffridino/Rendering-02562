"use strict";
window.onload = function () { main(); }
async function main()
{
    const gpu = navigator.gpu;
    const adapter = await gpu.requestAdapter();
    const device = await adapter.requestDevice();
    const canvas = document.getElementById("webgpu-canvas");
    const context = canvas.getContext("webgpu");
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            clearValue: {r: 0.0, g: 0.0, b: 1.0, a: 1.0},
            storeOp: "store",
        }]
    });

    const wgsl = device.createShaderModule({
        code: document.getElementById("wgsl").text
    });

    const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module: wgsl,
            entryPoint: "main_vs",
        },
        fragment: {
            module: wgsl,
            entryPoint: "main_fs",
            targets: [{ format: canvasFormat }]
        },
        primitive: {
            topology: "triangle-list",
        },
    });
    pass.setPipeline(pipeline);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
}