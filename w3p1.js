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

    
    var textureMenu = document.getElementById("textureMenu");
    var samplerMenu = document.getElementById("samplerMenu");

    async function load_texture(device, filename)
    {
        const img = document.createElement("img");
        img.src = filename;
        await img.decode();

        const imageCanvas = document.createElement('canvas');
        imageCanvas.width = img.width;
        imageCanvas.height = img.height;
        const imageCanvasContext = imageCanvas.getContext('2d');
        imageCanvasContext.drawImage(img, 0, 0, imageCanvas.width, imageCanvas.height);
        const imageData = imageCanvasContext.getImageData(0, 0, imageCanvas.width, imageCanvas.height);

        let textureData = new Uint8Array(img.width * img.height * 4);
        for(let i=0; i < img.height; ++i)
        {
            for(let j = 0; j < img.width; ++j)
            {
                for(let k = 0; k < 4; ++k)
                {
                    textureData[(i * img.width + j) * 4 + k] = imageData.data[((img.height - i - 1) * img.width + j) * 4 + k];
                }
            }
        }
        const texture = device.createTexture({
            size: [img.width, img.height, 1],
            format: "rgba8unorm",
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING
        });
        device.queue.writeTexture({texture: texture}, textureData,
            {offset: 0, bytesPerRow: img.width*4, rowsPerImage: img.height,}, [img.width, img.height, 1]);

        texture.sampler = device.createSampler({
            addressModeU: textureMenu.value,
            addressModeV: textureMenu.value,
            minFilter: samplerMenu.value,
            magFilter: samplerMenu.value,
        });
        return texture;
    }

    const texture = await load_texture(device, "data/grass.jpg");

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


    var bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
        {binding: 0, resource: texture.sampler},
        {binding: 1, resource: texture.createView()}
        ],
    });

    
    textureMenu.addEventListener("change", function ()
    {
        updateSampler();
        bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
            {binding: 0, resource: texture.sampler},
            {binding: 1, resource: texture.createView()}
            ],
        });
        requestAnimationFrame(render);
        // render();
        // load_texture(device, "data/grass.jpg");
    });

    
    samplerMenu.addEventListener("change", function ()
    {
        updateSampler();
        bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
            {binding: 0, resource: texture.sampler},
            {binding: 1, resource: texture.createView()}
            ],
        });
        requestAnimationFrame(render);
        // render();
        // load_texture(device, "data/grass.jpg");
    });

    function updateSampler()
    {
        texture.sampler = device.createSampler({
            addressModeU: textureMenu.value,
            addressModeV: textureMenu.value,
            minFilter: samplerMenu.value,
            magFilter: samplerMenu.value,
        });
    }
    updateSampler();

    function render() //can we leave the render function like this? Then change the bind group
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

    // function animate() { render(device, context, pipeline, bindGroup); }
    // animate();
}