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

    var obj_filename = "3D_Meshes/teapot.obj";
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

        const positionsBuffer = device.createBuffer({
            size: g_drawingInfo.vertices.byteLength, // number of bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(positionsBuffer, 0, g_drawingInfo.vertices);
    
        const indicesBuffer = device.createBuffer({
            size: g_drawingInfo.indices.byteLength, // number of bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(indicesBuffer, 0, g_drawingInfo.indices);

        bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
            {binding: 0, resource: {buffer : uniformBuffer }},
            // {binding: 1, resource: {buffer : jitterBuffer }},
            {binding: 1, resource: {buffer : positionsBuffer}},
            {binding: 2, resource: {buffer : indicesBuffer}},
            ],
        });
        return bindGroup;
    }

    // let jitter = new Float32Array(400); // allowing subdivs from 1 to 10
    // const jitterBuffer = device.createBuffer({
    //     size: jitter.byteLength,
    //     usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
    // });


    const uniformBuffer = device.createBuffer({
        size: 20, // number of bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // const vPositionsBuffer = device.createBuffer({
    //     size: 48, // number of bytes
    //     usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    // });
    // var vPositions = [vec4(1.368074, 2.435437, -0.227403, 0.0), vec4(1.381968, 2.400000, -0.229712, 0.0), vec4(1.400000, 2.400000, 0.000000, 0.0)]
    // device.queue.writeBuffer(vPositionsBuffer, 0, new Float32Array(flatten(vPositions)))
    // const meshFacesBuffer = device.createBuffer({
    //     size: 48, // number of bytes
    //     usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    // });
    // var meshFaces = [vec4(0, 1, 2, 0)];
    // device.queue.writeBuffer(meshFacesBuffer, 0, new Uint32Array(flatten(meshFaces)))
    // bindGroup = device.createBindGroup({
    //     layout: pipeline.getBindGroupLayout(0),
    //     entries: [
    //     {binding: 0, resource: {buffer : uniformBuffer }},
    //     // {binding: 1, resource: {buffer : jitterBuffer }},
    //     {binding: 1, resource: {buffer : vPositionsBuffer}},
    //     {binding: 2, resource: {buffer : meshFacesBuffer}},
    //     ],
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
    // compute_jitters(jitter, pixelsize, subdivsMenu.value);
    // device.queue.writeBuffer(jitterBuffer, 0, jitter);

    const aspect = canvas.width/canvas.height;
    var cam_const = 2.5;
    var subdivs = subdivsMenu.value
    var uniforms = new Float32Array([aspect, cam_const, subdivs]);
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    var sliderCamera = document.getElementById("sliderCamera");
    sliderCamera.addEventListener("input", function (ev)
    {
        cam_const = ev.srcElement.value;
        uniforms[1] = parseFloat(cam_const);
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);
        // requestAnimationFrame(render);
    });

    subdivsMenu.addEventListener("change", function ()
    {
        subdivs = subdivsMenu.value;
        uniforms[3] = subdivs;
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);
        compute_jitters(jitter, pixelsize, subdivs);
        device.queue.writeBuffer(jitterBuffer, 0, jitter);
        // requestAnimationFrame(render);
    });


    function animate()
    {
        if(!g_drawingInfo && g_objDoc && g_objDoc.isMTLComplete())
        {
            bindGroup = onReadComplete(device, pipeline);
        }
        if(!g_drawingInfo) {requestAnimationFrame(animate); return;}

        // requestAnimationFrame(animate);
        render()
    }
    animate();

    function render()
    {
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
    // render();
}