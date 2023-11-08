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

    var obj_filename = "3D_Meshes/smooth_bunny.obj";
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
            positions: null,
            normals: null,
            colors: null,
            indices: null,
            color: null,
            mat_indices: null,
            treeIds: null,
            bspTree: null,
            bspPlanes: null,
            aabb: null,
        }
        var matColors = [];
        // var matEmission = [];
        for (let i = 0; i < g_drawingInfo.materials.length; i++) {i
            matColors.push(g_drawingInfo.materials[i].color.r + g_drawingInfo.materials[i].emission.r);
            matColors.push(g_drawingInfo.materials[i].color.g + g_drawingInfo.materials[i].emission.g);
            matColors.push(g_drawingInfo.materials[i].color.b + g_drawingInfo.materials[i].emission.b);
            matColors.push(g_drawingInfo.materials[i].color.a + g_drawingInfo.materials[i].emission.a);
        }

        buffers.color = device.createBuffer({
            size: g_drawingInfo.mat_indices.byteLength, // number of bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(buffers.color, 0, new Float32Array(matColors));

        buffers.mat_indices = device.createBuffer({
            size: g_drawingInfo.mat_indices.byteLength, // number of bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(buffers.mat_indices, 0, g_drawingInfo.mat_indices);


        build_bsp_tree(g_drawingInfo, device, buffers);

        bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
            {binding: 0, resource: {buffer : uniformBuffer}},
            {binding: 1, resource: {buffer : buffers.aabb}},
            {binding: 2, resource: {buffer : buffers.positions}},
            {binding: 3, resource: {buffer : buffers.indices}},
            {binding: 4, resource: {buffer : buffers.normals}},
            {binding: 5, resource: {buffer : buffers.color}},
            {binding: 6, resource: {buffer : buffers.mat_indices}},
            {binding: 7, resource: {buffer : buffers.treeIds}},
            {binding: 8, resource: {buffer : buffers.bspTree}},
            {binding: 9, resource: {buffer : buffers.bspPlanes}},
            ],
        });

        return bindGroup;
    }


    const uniformBuffer = device.createBuffer({
        size: 20, // number of bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const aspect = canvas.width/canvas.height;
    var cam_const = 3.5;
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