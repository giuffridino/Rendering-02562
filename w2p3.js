"use strict";
window.onload = function () { main(); }
async function main()
{
    const gpu = navigator.gpu;
    const adapter = await gpu.requestAdapter();
    const device = await adapter.requestDevice();
    const canvas = document.getElementById("webgpu-canvas");
    const context = canvas.getContext("gpupresent") || canvas.getContext("webgpu");
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
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
            topology: "triangle-strip",
        },
    });

    const uniformBuffer = device.createBuffer({
        size: 20, // number of bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{
        binding: 0,
        resource: { buffer: uniformBuffer }
        }],
    });

    const aspect = canvas.width/canvas.height;
    var cam_const = 1.0;
    var shader = 1;
    var uniforms = new Float32Array([aspect, cam_const, shader]);
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    var sliderCamera = document.getElementById("sliderCamera");
    sliderCamera.addEventListener("input", function (ev)
    {
        cam_const = ev.srcElement.value;
        uniforms[1] = parseFloat(cam_const);
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);
        requestAnimationFrame(render);
    });

    var shaderSphere = document.getElementById("shaderSphere");
    var shaderButton = document.getElementById("shaderButton");
    shaderButton.addEventListener("click", function (ev)
    {
        shader = shaderSphere.selectedIndex;
        uniforms[2] = shader + 1;
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);
        requestAnimationFrame(render);
    });

    function render()
    {
        //Create a render pass in a command buffer and submit it
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
            }]
        });

        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(4);
        pass.end();
        device.queue.submit([encoder.finish()]);
    }
    render();
}