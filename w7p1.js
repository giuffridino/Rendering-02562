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
            targets: [{ format: canvasFormat },
                      { format: "rgba32float"}]
        },
        primitive: {
            topology: "triangle-strip",
        },
    });

    let textures = new Object();
    textures.width = canvas.width;
    textures.height = canvas.height;
    textures.renderSrc = device.createTexture({
    size: [canvas.width, canvas.height],
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    format: 'rgba32float',
    });
    textures.renderDst = device.createTexture({
    size: [canvas.width, canvas.height],
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    format: 'rgba32float',
    });

    // let jitter = new Float32Array(400); // allowing subdivs from 1 to 10
    // const jitterBuffer = device.createBuffer({
    //     size: jitter.byteLength,
    //     usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
    // });
    // var subdivsMenu = document.getElementById("subdivsMenu");
    // function compute_jitters(jitter, pixelsize, subdivs)
    // {
    //     const step = pixelsize/subdivs;
    //     if(subdivs < 2) {
    //         jitter[0] = 0.0;
    //         jitter[1] = 0.0;
    //     }
    //     else {
    //         for(var i = 0; i < subdivs; ++i)
    //         for(var j = 0; j < subdivs; ++j) {
    //             const idx = (i*subdivs + j)*2;
    //             jitter[idx] = (Math.random() + j)*step - pixelsize*0.5;
    //             jitter[idx + 1] = (Math.random() + i)*step - pixelsize*0.5;
    //         }
    //     }
    // }
    // const pixelsize = 1/canvas.height;
    // // const subdivisions = 10;
    // compute_jitters(jitter, pixelsize, subdivsMenu.value);
    // device.queue.writeBuffer(jitterBuffer, 0, jitter);
    // subdivsMenu.addEventListener("change", function ()
    // {
    //     subdivs = subdivsMenu.value;
    //     uniforms[3] = subdivs;
    //     device.queue.writeBuffer(uniformBuffer, 0, uniforms);
    //     compute_jitters(jitter, pixelsize, subdivs);
    //     device.queue.writeBuffer(jitterBuffer, 0, jitter);
    //     animate();
    //     // requestAnimationFrame(render);
    // });

    var obj_filename = "3D_Meshes/CornellBox.obj";
    var g_objDoc = null;
    var g_drawingInfo = null;

    function readOBJFile(fileName, scale, reverse)
    {
        var request = new XMLHttpRequest();
        request.onreadystatechange = function(){
            if(request.readyState === 4 && request.status !== 404){
                onReadOBJFile(request.responseText, fileName, scale, reverse);
            }
        }
        request.open('GET', fileName, true);
        request.send();
    }

    readOBJFile(obj_filename, 1, true);

    function onReadOBJFile(fileString, fileName, scale, reverse)
    {
        var objDoc = new OBJDoc(fileName);
        var result = objDoc.parse(fileString, scale, reverse);
        if(!result){
            g_objDoc = null; g_drawingInfo = null;
            console.log("OBJ Parsing Error");
            return;
        }
        g_objDoc = objDoc;
    }

    var bindGroup;
    function onReadComplete(device, pipeline)
    {
        g_drawingInfo = g_objDoc.getDrawingInfo();

        var buffers = {
            attribs: null,
            color: null,
            colors: null,
            indices: null,
            light_indices: null,
            treeIds: null,
            bspTree: null,
            bspPlanes: null,
            aabb: null,
        }

        var matColors = [];
        for (let i = 0; i < g_drawingInfo.materials.length; i++) {i
            matColors.push(g_drawingInfo.materials[i].color.r + g_drawingInfo.materials[i].emission.r);
            matColors.push(g_drawingInfo.materials[i].color.g + g_drawingInfo.materials[i].emission.g);
            matColors.push(g_drawingInfo.materials[i].color.b + g_drawingInfo.materials[i].emission.b);
            matColors.push(g_drawingInfo.materials[i].color.a + g_drawingInfo.materials[i].emission.a);
        }

        buffers.color = device.createBuffer({
            size: g_drawingInfo.materials.length * 16.0, // number of bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(buffers.color, 0, new Float32Array(matColors));

        // buffers.mat_indices = device.createBuffer({
        //     size: g_drawingInfo.mat_indices.byteLength, // number of bytes
        //     usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        // });
        // device.queue.writeBuffer(buffers.mat_indices, 0, g_drawingInfo.mat_indices);
        buffers.light_indices = device.createBuffer({
            size: g_drawingInfo.light_indices.byteLength, // number of bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(buffers.light_indices, 0, g_drawingInfo.light_indices);


        build_bsp_tree(g_drawingInfo, device, buffers);

        bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
            {binding: 0, resource: {buffer : uniformBuffer}},
            {binding: 1, resource: {buffer : uniformUIBuffer}},
            {binding: 2, resource: {buffer : buffers.aabb}},
            {binding: 3, resource: {buffer : buffers.attribs}},
            {binding: 4, resource: {buffer : buffers.indices}},
            {binding: 5, resource: {buffer : buffers.color}},
            {binding: 6, resource: {buffer : buffers.light_indices}},
            {binding: 7, resource: {buffer : buffers.treeIds}},
            {binding: 8, resource: {buffer : buffers.bspTree}},
            {binding: 9, resource: {buffer : buffers.bspPlanes}},
            // {binding: 10, resource: { buffer: jitterBuffer }},
            {binding: 11, resource: textures.renderDst.createView()},
            ],
        });

        return bindGroup;
    }


    const uniformBuffer = device.createBuffer({
        size: 20, // number of bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const uniformUIBuffer = device.createBuffer({
        size: 12, // number of bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    var progressing = true;
    var progressiveButton = document.getElementById("Progressive");
    progressiveButton.addEventListener("click", function()
    {
        if (progressing === true) 
        {
            progressing = false;
        }
        else
        {
            progressing = true;
            animate();
            // requestAnimationFrame(animate);
        }
        // requestAnimationFrame(render);
    });

    const aspect = canvas.width/canvas.height;
    var cam_const = 1;
    // var subdivs = subdivsMenu.value
    // var uniforms = new Float32Array([aspect, cam_const, subdivs]);
    var uniforms = new Float32Array([aspect, cam_const]);
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);
    var frame = 0;
    var uniformsUI = new Float32Array([canvas.width, canvas.height, frame]);
    device.queue.writeBuffer(uniformUIBuffer, 0, uniformsUI);


    function animate()
    {
        if(!g_drawingInfo && g_objDoc && g_objDoc.isMTLComplete())
        {
            bindGroup = onReadComplete(device, pipeline);
        }
        if(!g_drawingInfo) {requestAnimationFrame(animate); return;}

        render()
        if (progressing) 
        {
            frame++;
            uniformsUI = new Uint32Array([canvas.width, canvas.height, frame]);
            device.queue.writeBuffer(uniformUIBuffer, 0, uniformsUI);
            // console.log(frame);
            requestAnimationFrame(animate);
        }        
    }
    animate();

    function render()
    {
        // console.log(frame);
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [
                {view: context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store"},
                {view: textures.renderSrc.createView(), loadOp: frame === 0 ? "clear" : "load", storeOp: "store"}]
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup); 
        pass.draw(4);
        pass.end();
        encoder.copyTextureToTexture({ texture: textures.renderSrc }, { texture: textures.renderDst }, [textures.width, textures.height]);
        device.queue.submit([encoder.finish()]);
    }
    // render();
}