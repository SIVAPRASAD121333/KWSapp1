import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Button, PermissionsAndroid, Platform, Alert } from 'react-native';
import AudioRecorderPlayer from 'react-native-audio-recorder-player'
import DocumentPicker from 'react-native-document-picker'
import RNFetchBlob from 'rn-fetch-blob'
import { FFmpegKit, FFmpegKitConfig } from 'ffmpeg-kit-react-native'

FFmpegKitConfig.enableLogs()
FFmpegKit.execute(`-version`).then(session => {
  console.log("FFmpegKit is ready");
})

const App = () => {
  const [filer,setFile]=useState(null)
  const [load,setLoad]=useState(false)
  const [conf,setConf]=useState(null)
  const [keyword,setkeyword]=useState(null)
  const [timer, setTimer] = useState('00.00.00')
  const [rec_path, set_rec_path] = useState(null)
  const [buttonclck, setrbtnclck] = useState("bng")
  const [recording, setRecording] = useState(false)
  const [audioRecorderPlayer] = useState(new AudioRecorderPlayer())

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        ]);

        if (
          granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED &&
          granted[PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE] === PermissionsAndroid.RESULTS.GRANTED &&
          granted[PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE] === PermissionsAndroid.RESULTS.GRANTED
        ) {
          return true;
        } else {
          Alert.alert('Permissions required', 'Please grant audio recording and storage permissions to proceed.');
          return false;
        }
      } catch (err) {
        console.error('Permission error:', err);
        return false;
      }
    }
    // iOS permissions are typically handled in the Info.plist
    return true;
  }
  const handleSubmit = async (e) => {
    if(rec_path===null && filer===null){
      alert('Select file or record audio')
      return
    }
    console.log(`Rec path: ${rec_path}\nFile object: ${filer}`);
    
    try {
      setLoad(true)
      if (filer === null) {
        const fileExists1 = await RNFetchBlob.fs.exists(rec_path);
        if (!fileExists1) {
          console.error("Recording file not found!");
          return;
        }else console.log("Recording file found! Path: ", rec_path);
        
        const cleanedPath = rec_path.replace("file://", "");

        const wavFileName = cleanedPath.split('/').pop().replace('.mp4', '.wav');
        const outputPath = `${RNFetchBlob.fs.dirs.CacheDir}/${wavFileName}`;
        await FFmpegKit.execute(`-i "${cleanedPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputPath}"`);

        const fileExists = await RNFetchBlob.fs.exists(outputPath);
        if (!fileExists) {
          console.error("Conversion failed, output file does not exist.");
          return;
        }
        const response = await RNFetchBlob.fetch(
          "POST",
          `http://192.168.154.35:5000/flask_process_audio_${buttonclck}`,
          {
            "Content-Type": "multipart/form-data",
          },
          [
            {
              name: "audio_data",
              filename: 'audio.wav',
              type: "audio/wav",
              // data: RNFetchBlob.wrap(rec_path),
              data: RNFetchBlob.wrap(outputPath),
            },
          ]
        );
        const result = await response.json();
        console.log('File uploaded successfully:', JSON.stringify(result));
        setConf(result["conf"]);
        setkeyword(result["result"]);
      } 
      else if (rec_path === null) {
        const { uri, name } = filer[0];
        const wavFileName = name.replace(".m4a", ".wav");
        const tempFilePath = `${RNFetchBlob.fs.dirs.CacheDir}/${name}`;
        const outputPath = `${RNFetchBlob.fs.dirs.CacheDir}/${wavFileName}`;
        const copiedFilePath = await RNFetchBlob.fs.cp(uri, tempFilePath);
        
        await FFmpegKit.execute(`-i "${tempFilePath}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputPath}"`);
        
        const fileExists = await RNFetchBlob.fs.exists(outputPath);
        if (!fileExists) {
          console.error("Conversion failed, output file does not exist.");
          return;
        }
        const response = await RNFetchBlob.fetch(
          "POST",
          `http://192.168.154.35:5000/flask_process_audio_${buttonclck}`,
          {
            "Content-Type": "multipart/form-data",
          },
          [
            {
              name: "audio_data",
              filename: 'audio.wav',
              type: "audio/wav",
              data: RNFetchBlob.wrap(outputPath),
            },
          ]
        );
        const result = await response.json();
        console.log('File uploaded successfully:', JSON.stringify(result));
        setConf(result["conf"]);
        setkeyword(result["result"]);
      }

    }catch (error) {
      console.warn('Error during file upload:', error);
      console.log('Error name:', error.name);
      console.log('Error message:', error.message);
      console.log('Error stack:', error.stack);
      if (error.response) {
        console.log('Error response status:', error.response.status);
        console.log('Error response headers:', error.response.headers);
        console.log('Error response body:', error.response.data);
      }
      alert('Error during file upload: ' + error.message);
    } finally {
      setLoad(false)
      set_rec_path(null);
      setFile(null);    
      setTimer('00.00.00')
    }
  }
  const chooseFile = async () => {
    const hasPermissions = await requestPermissions();
    if (!hasPermissions) return;
    try {
      const res = await DocumentPicker.pick({
        type: [DocumentPicker.types.audio],
      });
      console.log(res)
      // setFile(res[0]['uri']);
      setFile(res);
      set_rec_path(null)
    } catch (error) {
      if (!DocumentPicker.isCancel(error)) console.error('Error picking file:', error);
    }
  }
  const startRecording = async () => {
    setTimer('00:00:00');
    try {
      const result = await audioRecorderPlayer.startRecorder();
      audioRecorderPlayer.addRecordBackListener((e) => {
        setTimer(audioRecorderPlayer.mmssss(Math.floor(e.currentPosition)));
      });
      setRecording(true);
      console.log("Recording Started: ",result);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  }
  const stopRecording = async () => {
    try {
      const result = await audioRecorderPlayer.stopRecorder();
      audioRecorderPlayer.removeRecordBackListener();
      setRecording(false);
      set_rec_path(result)
      setFile(null)
      console.log("Recording stopped: ",result);
    } catch (error) {
      console.error('Error stopping recording:', error);
    }
  }
  const playRecording = async () => {
    try {
      let result;
      if(filer){
        const fileUri = filer[0].uri
        let actualFilePath

        if (Platform.OS === 'android') {
          actualFilePath = await RNFetchBlob.fs.stat(fileUri).then(stats => stats.path);
        } else {
          actualFilePath = fileUri;
        }

        result = await audioRecorderPlayer.startPlayer(actualFilePath);
      }
      else
        result = await audioRecorderPlayer.startPlayer();

      audioRecorderPlayer.addPlayBackListener((e) => {
        if (e.currentPosition === e.duration) {
          audioRecorderPlayer.stopPlayer();
          // setIsPlaying(false);
        }
        // setPlayTime(audioRecorderPlayer.mmssss(Math.floor(e.currentPosition)));
        // setDuration(audioRecorderPlayer.mmssss(Math.floor(e.duration)));
      });
      // setIsPlaying(true);
      console.log(result);
    } catch (error) {
      console.error('Error starting playback:', error);
    }
  }
  const stopPlaying = async () => {
    try {
      const result = await audioRecorderPlayer.stopPlayer();
      audioRecorderPlayer.removePlayBackListener();
      // setIsPlaying(false);
      // setPlayTime('00:00:00');
      console.log(result);
    } catch (error) {
      console.error('Error stopping playback:', error);
    }
  }
  const handleDownload = () => {
    console.log('Downloading file...')
  }
  useEffect(()=>{
    const demo=async ()=>{
      const hasPermissions = await requestPermissions();
      if (!hasPermissions) alert("Permission Request Denied!")
    }
    demo()
    return () => {
      audioRecorderPlayer.stopRecorder();
      audioRecorderPlayer.stopPlayer();
    }
  },[])

  return (
    <View style={styles.container}>
      <Text style={styles.header}>🎤 Welcome to End-to-End Spoken Keyword Spotting Systems 🎤</Text>
      <Text>Timer: {timer}</Text>

      <TouchableOpacity
        style={styles.button}
        onPress={recording ? stopRecording : startRecording}>
        <Text>{recording ? 'Stop Recording' : 'Start Recording'}</Text>
      </TouchableOpacity>

      <Button title="Choose File" onPress={chooseFile} />
      <Button title="Submit" onPress={handleSubmit} />
      <Button title="Download" onPress={handleDownload} />

      <View style={styles.languageContainer}>
        <TouchableOpacity style={[styles.languageButton,{backgroundColor:buttonclck==='bng'?'lightgreen':'#2196F3'}]} onPress={()=>setrbtnclck('bng')}>
          <Text>Bengali</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.languageButton,{backgroundColor:buttonclck==='man'?'lightgreen':'#2196F3'}]} onPress={()=>setrbtnclck('man')}>
          <Text>Manipuri</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.languageButton,{backgroundColor:buttonclck==='miz'?'lightgreen':'#2196F3'}]} onPress={()=>setrbtnclck('miz')}>
          <Text>Mizoram</Text>
        </TouchableOpacity>
      </View>

      {(rec_path !==null || filer !==null) &&<View style={styles.languageContainer}>
        <TouchableOpacity onPress={playRecording} 
        style={{backgroundColor:'#4CAF50',padding:10,borderRadius:10}}>
          <Text>Play</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={stopPlaying} 
        style={{backgroundColor:'#f44336',padding:10,borderRadius:10}}>
          <Text>Stop</Text>
        </TouchableOpacity>
      </View>}

      <View style={styles.languageContainer}>
        <Text>Confidence: {conf===null?"":conf}</Text>
        <Text>Keyword: {keyword===null?"":keyword}</Text>
      </View>

      <View style={styles.languageContainer}>
        <Text>{!load?"":"Loading..."}</Text>
      </View>

      <Text style={styles.footer}>
        Indian Institute of Information Technology, Sri City, Chittoor
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5' },
  header: { fontSize: 18, textAlign: 'center', marginVertical: 20 },
  button: { backgroundColor: '#4CAF50', padding: 10, marginVertical: 10, alignItems: 'center' },
  languageContainer: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 20 },
  languageButton: { padding: 10, backgroundColor: '#2196F3', borderRadius: 5 },
  footer: { textAlign: 'center', marginTop: 20, color: '#888' },
})

export default App