# Camera & Network — Technical Questionnaire

Please provide the following information so we can accurately estimate the development and integration time.

### Camera & Video

1. **What camera brands and models are being used?**
   Please provide model numbers and the number of cameras for each model.

2. **Are the cameras IP/network cameras, analog cameras, or connected through an NVR/DVR?**

3. **What video protocols do the cameras/NVR support?**
   e.g. RTSP, ONVIF, HLS, RTMP, WebRTC, HTTP/MJPEG.

4. **Do the cameras provide RTSP streams?**
   If yes, please provide an example RTSP URL format (without passwords).

5. **Do the cameras support ONVIF?**
   If known, please provide the ONVIF version.

6. **What video codecs and resolutions are being used?**
   e.g. H.264/H.265, 1080p/4K, FPS, bitrate.

7. **Are multiple streams available per camera (main stream/sub-stream)?**
   If yes, provide their resolutions/codecs.

### NVR / Infrastructure

8. **Is an NVR/DVR being used?**
   If yes, provide the manufacturer, model, firmware version, and number of connected cameras.

9. **Does the NVR provide an API or SDK?**
   If yes, please provide its documentation.

10. **Where is video currently recorded/stored?**
    NVR, local server, cloud, SD card, etc.

### Network

11. **How are the cameras connected to the network?**
    Ethernet/PoE, Wi-Fi, etc.

12. **Please provide a basic network diagram.**
    Example: Cameras → PoE Switch → Router/Firewall → Internet.

13. **Are the cameras on a separate VLAN/subnet?**
    If yes, provide the relevant network structure.

14. **What networking equipment is being used?**
    Switches, routers, firewalls, VPNs, etc., including manufacturers/models where possible.

15. **What are the camera network's IP ranges/subnets?**
    Please provide the relevant private IP ranges without credentials.

16. **Will the system need to access cameras locally, remotely, or both?**

17. **If remote access is required, how is the camera network currently accessed?**
    VPN, public IP, port forwarding, cloud access, etc.

18. **What are the available upload/download speeds at the camera location(s)?**

19. **How many separate sites/locations have cameras?**
    Please provide the approximate number of cameras at each site.

20. **Are there any existing API, SDK, network, camera, or NVR documentation/resources available?**
    Please provide them if available.
