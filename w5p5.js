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

    var obj_filename = "3D_Meshes/CornellBoxWithBlocks.obj";
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

        var matColors = [];
        var matEmission = [];
        for (let i = 0; i < g_drawingInfo.materials.length; i++) {i
            matColors.push(g_drawingInfo.materials[i].color.r);
            matColors.push(g_drawingInfo.materials[i].color.g);
            matColors.push(g_drawingInfo.materials[i].color.b);
            matColors.push(g_drawingInfo.materials[i].color.a);
            matEmission.push(g_drawingInfo.materials[i].emission.r);
            matEmission.push(g_drawingInfo.materials[i].emission.g);
            matEmission.push(g_drawingInfo.materials[i].emission.b);
            matEmission.push(g_drawingInfo.materials[i].emission.a);
        }

        // var tempcolors = new Float32Array(flatten(matColors));
        const materialColorBuffer = device.createBuffer({
            size: g_drawingInfo.mat_indices.byteLength, // number of bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(materialColorBuffer, 0, new Float32Array(matColors));

        const materialEmissionBuffer = device.createBuffer({
            size: g_drawingInfo.mat_indices.byteLength, // number of bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(materialEmissionBuffer, 0, new Float32Array(matEmission));

        const mat_indicesBuffer = device.createBuffer({
            size: g_drawingInfo.mat_indices.byteLength, // number of bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(mat_indicesBuffer, 0, g_drawingInfo.mat_indices);

        const light_indicesBuffer = device.createBuffer({
            size: g_drawingInfo.light_indices.byteLength, // number of bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(light_indicesBuffer, 0, g_drawingInfo.light_indices);

        bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
            {binding: 0, resource: {buffer : uniformBuffer }},
            {binding: 1, resource: {buffer : positionsBuffer}},
            {binding: 2, resource: {buffer : indicesBuffer}},
            {binding: 3, resource: {buffer : normalsBuffer}},
            {binding: 4, resource: {buffer : materialColorBuffer}},
            {binding: 5, resource: {buffer : materialEmissionBuffer}},
            {binding: 6, resource: {buffer : mat_indicesBuffer}},
            {binding: 7, resource: {buffer : light_indicesBuffer}},
            ],
        });

        return bindGroup;
    }


    const uniformBuffer = device.createBuffer({
        size: 20, // number of bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const aspect = canvas.width/canvas.height;
    var cam_const = 1;
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