/* RoomEnvironment 全局版（挂 window.RoomEnvironment）
   基于 three.js examples 的 RoomEnvironment，用于生成环境反射贴图 */
(function () {
  'use strict';
  var THREE = window.THREE;

  function createAreaLightMaterial(intensity) {
    var material = new THREE.MeshBasicMaterial();
    material.color.setScalar(intensity);
    return material;
  }

  class RoomEnvironment extends THREE.Scene {
    constructor() {
      super();
      var geometry = new THREE.BoxGeometry();
      geometry.deleteAttribute('uv');

      var roomMaterial = new THREE.MeshStandardMaterial({ side: THREE.BackSide });
      var boxMaterial = new THREE.MeshStandardMaterial();

      var mainLight = new THREE.PointLight(0xffffff, 5, 28, 2);
      mainLight.position.set(0.418, 16.199, 0.300);
      this.add(mainLight);

      var room = new THREE.Mesh(geometry, roomMaterial);
      room.position.set(-0.757, 13.219, 0.717);
      room.scale.set(31.713, 28.305, 28.591);
      this.add(room);

      var boxes = [
        [-10.906, 2.009, 1.846, 0, -0.195, 0, 2.328, 7.905, 4.651],
        [-5.607, -0.754, -0.758, 0, 0.994, 0, 1.970, 1.534, 3.955],
        [6.167, 0.857, 7.803, 0, 0.561, 0, 3.927, 6.285, 3.687],
        [-2.017, 0.018, 6.124, 0, 0.333, 0, 2.002, 4.566, 2.064],
        [2.291, -0.756, -2.621, 0, -0.286, 0, 1.546, 1.552, 1.496],
        [-2.193, -0.369, -5.547, 0, 0.516, 0, 3.875, 3.487, 2.986],
      ];
      for (var i = 0; i < boxes.length; i++) {
        var b = boxes[i];
        var box = new THREE.Mesh(geometry, boxMaterial);
        box.position.set(b[0], b[1], b[2]);
        box.rotation.set(b[3], b[4], b[5]);
        box.scale.set(b[6], b[7], b[8]);
        this.add(box);
      }

      var lights = [
        [-16.116, 14.37, 8.208, 0.1, 2.428, 2.739, 50],
        [-16.109, 18.021, -8.207, 0.1, 2.425, 2.751, 50],
        [14.904, 12.198, -1.832, 0.15, 4.265, 6.331, 17],
        [-0.462, 8.89, 14.520, 4.38, 5.441, 0.088, 43],
        [3.235, 11.486, -12.541, 2.5, 2.0, 0.1, 20],
        [0.0, 20.0, 0.0, 1.0, 0.1, 1.0, 100],
      ];
      for (var j = 0; j < lights.length; j++) {
        var l = lights[j];
        var light = new THREE.Mesh(geometry, createAreaLightMaterial(l[6]));
        light.position.set(l[0], l[1], l[2]);
        light.scale.set(l[3], l[4], l[5]);
        this.add(light);
      }
    }

    dispose() {
      var resources = new Set();
      this.traverse(function (object) {
        if (object.isMesh) {
          resources.add(object.geometry);
          resources.add(object.material);
        }
      });
      resources.forEach(function (r) { r.dispose(); });
    }
  }

  window.RoomEnvironment = RoomEnvironment;
})();
