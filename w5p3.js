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

        const normalsBuffer = device.createBuffer({
            size: g_drawingInfo.normals.byteLength, // number of bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(normalsBuffer, 0, g_drawingInfo.normals);

        bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
            {binding: 0, resource: {buffer : uniformBuffer }},
            {binding: 1, resource: {buffer : positionsBuffer}},
            {binding: 2, resource: {buffer : indicesBuffer}},
            {binding: 3, resource: {buffer : normalsBuffer}},
            ],
        });

        return bindGroup;
    }


    const uniformBuffer = device.createBuffer({
        size: 20, // number of bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const aspect = canvas.width/canvas.height;
    var cam_const = 2.5;
    var uniforms = new Float32Array([aspect, cam_const]);
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);


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