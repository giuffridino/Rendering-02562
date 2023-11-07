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

    let jitter = new Float32Array(400); // allowing subdivs from 1 to 10
    const jitterBuffer = device.createBuffer({
        size: jitter.byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
    });
    const uniformBuffer = device.createBuffer({
        size: 20, // number of bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

    const vPositionsBuffer = device.createBuffer({
        size: 48, // number of bytes
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    var vPositions = [vec4(-0.2, 0.1, 0.9, 0.0), vec4(0.2, 0.1, 0.9, 0.0), vec4(-0.2, 0.1, -0.1, 0.0)]
    device.queue.writeBuffer(vPositionsBuffer, 0, new Float32Array(flatten(vPositions)))
    const meshFacesBuffer = device.createBuffer({
        size: 48, // number of bytes
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    var meshFaces = [vec4(0, 1, 2, 0)];
    device.queue.writeBuffer(meshFacesBuffer, 0, new Uint32Array(flatten(meshFaces)))

    var bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
        {binding: 0, resource: { buffer: uniformBuffer }},
        {binding: 1, resource: texture.sampler},
        {binding: 2, resource: texture.createView()},
        {binding: 3, resource: { buffer: jitterBuffer }},
        {binding: 4, resource: {buffer : vPositionsBuffer}},
        {binding: 5, resource: {buffer : meshFacesBuffer}},
        ],
    });

    var subdivsMenu = document.getElementById("subdivsMenu");
    function compute_jitters(jitter, pixelsize, subdivs)
    {
        const step = pixelsize/subdivs;
        if(subdivs < 2) {
            jitter[0] = 0.0;
            jitter[1] = 0.0;
        }
        else {
            for(var i = 0; i < subdivs; ++i)
            for(var j = 0; j < subdivs; ++j) {
                const idx = (i*subdivs + j)*2;
                jitter[idx] = (Math.random() + j)*step - pixelsize*0.5;
                jitter[idx + 1] = (Math.random() + i)*step - pixelsize*0.5;
            }
        }
    }
    const pixelsize = 1/canvas.height;
    compute_jitters(jitter, pixelsize, subdivsMenu.value);
    device.queue.writeBuffer(jitterBuffer, 0, jitter);

    const aspect = canvas.width/canvas.height;
    var cam_const = 1.0;
    var shader = 1;
    var subdivs = subdivsMenu.value
    var uniforms = new Float32Array([aspect, cam_const, shader, subdivs]);
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    var sliderCamera = document.getElementById("sliderCamera");
    sliderCamera.addEventListener("input", function (ev)
    {
        cam_const = ev.srcElement.value;
        uniforms[1] = parseFloat(cam_const);
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);
        requestAnimationFrame(render);
    });

    var shaderSphereMenu = document.getElementById("shaderSphereMenu");
    shaderSphereMenu.addEventListener("change", function ()
    {
        shader = shaderSphereMenu.value;
        uniforms[2] = shader;
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);
        requestAnimationFrame(render);
    });

    subdivsMenu.addEventListener("change", function ()
    {
        subdivs = subdivsMenu.value;
        uniforms[3] = subdivs;
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);
        compute_jitters(jitter, pixelsize, subdivs);
        device.queue.writeBuffer(jitterBuffer, 0, jitter);
        requestAnimationFrame(render);
    });

    textureMenu.addEventListener("change", function ()
    {
        updateSampler();
        bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
            {binding: 0, resource: { buffer: uniformBuffer }},
            {binding: 1, resource: texture.sampler},
            {binding: 2, resource: texture.createView()},
            {binding: 3, resource: { buffer: jitterBuffer }},
            {binding: 4, resource: {buffer : vPositionsBuffer}},
            {binding: 5, resource: {buffer : meshFacesBuffer}},
            ],
        });
        requestAnimationFrame(render);
        console.log(textureMenu.value);
    });

    samplerMenu.addEventListener("change", function ()
    {
        updateSampler();
        bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
            {binding: 0, resource: { buffer: uniformBuffer }},
            {binding: 1, resource: texture.sampler},
            {binding: 2, resource: texture.createView()},
            {binding: 3, resource: { buffer: jitterBuffer }},
            {binding: 4, resource: {buffer : vPositionsBuffer}},
            {binding: 5, resource: {buffer : meshFacesBuffer}},
            ],
        });
        requestAnimationFrame(render);
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
}