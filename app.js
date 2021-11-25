// 'use strict';

//  Google Cloud Speech Playground with node.js and socket.io
//  Created by Vinzenz Aubry for sansho 24.01.17
//  Feel free to improve!
//	Contact: v@vinzenzaubry.com
// const http = require('http');
const express = require('express'); // const bodyParser = require('body-parser'); // const path = require('path');
var app = express();
var cors = require('cors');
// var bodyParser = require('body-parser');

const environmentVars = require('dotenv').config();
const apiSpeechBD = require('./controllers/apibd');

app.use(cors());

// Google Cloud
const textToSpeech = require('@google-cloud/text-to-speech');
const speech = require('@google-cloud/speech');
const speechClient = new speech.SpeechClient(); // Creates a client

const fs = require('fs');
const util = require('util');


const port = process.env.PORT || 1337;
const server = require('http').createServer(app);

const io = require('socket.io')(server,{  
  cors: {
      origin: '*',      
  },
  path: "/socket.io.speech"
});

// app.use('/assets', express.static(__dirname + '/public'));
// app.use('/session/assets', express.static(__dirname + '/public'));
// app.set('view engine', 'ejs');

// =========================== ROUTERS ================================ //

app.get('/', function (req, res) {
  // res.render('index', {});
  res.json({
    status: "success",
    message: "API V3",
    data: {
      "version_number": "v1.0.0"
    }
  });
});

app.use('/', function (req, res, next) {
  next(); // console.log(`Request Url: ${req.url}`);
});

app.get('/resources/:fileName', function(req ,res) {
  // var path = require('path');
  // var file = path.join('./resources', req.params.fileName);
  // res.send(file);

  var music = './resources/'+req.params.fileName;
  var stat = fs.statSync(music);
    range = req.headers.range;
    var readStream;

    if (range !== undefined) {
        var parts = range.replace(/bytes=/, "").split("-");

        var partial_start = parts[0];
        var partial_end = parts[1];

        var start = parseInt(partial_start, 10);
        var end = partial_end ? parseInt(partial_end, 10) : stat.size - 1;
        var content_length = (end - start) + 1;

        res.status(206).header({
            'Content-Type': 'audio/mpeg',
            'Content-Length': content_length,
            'Content-Range': "bytes " + start + "-" + end + "/" + stat.size
        });

        readStream = fs.createReadStream(music, {start: start, end: end});
    } else {
        res.header({
            'Content-Type': 'audio/mpeg',
            'Content-Length': stat.size
        });
        readStream = fs.createReadStream(music);
    }
    readStream.pipe(res);
});

// =========================== SOCKET.IO ================================ //


io.on('connection', function (client) {
  console.log('Client Connected to server', client.id);
  let recognizeStream = null;

  client.on('disconnect', () => {
    console.log('disconnect');
  });

  client.on('join', function () {
    client.emit('messages', 'Socket Connected to Server');
  });

  client.on('messages', function (data) {
    client.emit('broad', data);
  });

  client.on('startGoogleCloudStream', function (data) {
    startRecognitionStream(this, data);
  });

  client.on('endGoogleCloudStream', function () {
    stopRecognitionStream();
  });

  client.on('binaryData', function (data) {
    // console.log(data); //log binary data
    if (recognizeStream !== null) {
      recognizeStream.write(data);
    }
  });

  function startRecognitionStream(client) {
    recognizeStream = speechClient
      .streamingRecognize(request)
      .on('error', console.error)
      .on('data', (data) => {
        process.stdout.write(
          data.results[0] && data.results[0].alternatives[0]
            ? `Transcription: ${data.results[0].alternatives[0].transcript} => ${client.id}\n`
            : '\n\nReached transcription time limit, press Ctrl+C => \n'
        );
        client.emit('speechData', data);

        // if end of utterance, let's restart stream
        // this is a small hack. After 65 seconds of silence, the stream will still throw an error for speech length limit
        if (data.results[0] && data.results[0].isFinal) {
          stopRecognitionStream();
          startRecognitionStream(client);
          // console.log('restarted stream serverside');
        }
      });
  }

  function stopRecognitionStream() {
    if (recognizeStream) {
      recognizeStream.end();
    }
    recognizeStream = null;
  }


  client.on('tts', function (data) {

    getAudioSpeech(data);
    // return;

    // client.emit('speechDataTTS', '');
    // return;
    // textToAudioMP3(text).then(function(results){
    //   console.log(results);
    //   client.emit('speechDataTTS', results);
    // }).catch(function(e){
    //     console.log(e);
    // });
  });

  async function getAudioSpeech(data) {
    // primero buscamos en db
    let nameSearchAudio = await apiSpeechBD.getAudioResource(data);
    console.log('nameSearchAudio', nameSearchAudio);
    if ( nameSearchAudio.length > 0 ) {
      client.emit('speechDataTTS', nameSearchAudio[0].nomfile);
    } else {
      // genera audio
      
      const nomFileSave = getNomFileSave(data);
      nameSearchAudio = nomFileSave;

      textToAudioMP3(data.text, nomFileSave).then(function(results){
        // console.log(results);
        client.emit('speechDataTTS', nomFileSave);

        // guarda en bd
        data.nomfile = nomFileSave;
        apiSpeechBD.insertAudioResource(data);

      }).catch(function(e){
          console.log(e);
      });
    }
    // console.log('nameSearchAudio', nameSearchAudio);
  }

  // TTS mp3
  async function textToAudioMP3(text, nomfile){    
    const outputFile = `./resources/${nomfile}`;
    requestTTS.input = { text: text }; // text or SSML    
    const [response] = await ttsClient.synthesizeSpeech(requestTTS);
    const writeFile = util.promisify(fs.writeFile);
    await writeFile(outputFile, response.audioContent, 'binary');
    // console.log(`Audio content written to file: ${outputFile}`);
  }

  /// TTS
  async function textToAudioBuffer(text) {
    requestTTS.input = { text: text }; // text or SSML
    const response = await ttsClient.synthesizeSpeech(requestTTS);
    return response[0].audioContent;
  }      

  function getNomFileSave(data) {
    const _idsede = data.idsede || 0;
    return `${_idsede}${data.idcomando_voz}-${new Date().getTime()}.mp3`;
  }

});

// =========================== GOOGLE CLOUD SETTINGS ================================ //

// The encoding of the audio file, e.g. 'LINEAR16'
// The sample rate of the audio file in hertz, e.g. 16000
// The BCP-47 language code to use, e.g. 'en-US'
const encoding = 'LINEAR16';
const sampleRateHertz = 16000;
const languageCode = 'es-US'; //en-US
const _phrases = "léeme,leeme,dime,díme,lee,que hay,qué hay,que tienes,qué tienes,cuáles son,muestrame,muéstrame,muestra,quiero ver,vamos a,vámos a,regresa a,vuelve a,ver,como es,cómo es,que trae,qué trae,qué ingredientes,qué ingredientes,con qué se acompaña,qué acompaña,qué acompaña,con qué viene,cómo preparan,cómo se prepara,cómo prepara,cómo lo preparan,qué lleva,dame,me das,quiero,agrega,suma,sumame,agregue,agregame,aumenta,aumentar,agregar,menos,quita,saca,retira,resta,restame,réstame,quitame,quítame,sacame,sácame,ya no,mejor no,mejor ya no,borra,bórrame,quítale,quitar,retirar,qué sea solo,solo".split(',');

const request = {
  config: {
    encoding: encoding,
    sampleRateHertz: sampleRateHertz,
    languageCode: languageCode,
    profanityFilter: false,
    enableWordTimeOffsets: true,
    enableAutomaticPunctuation: true,
    model: 'default',    
    // maxAlternatives: 5
    speechContexts: [{
        phrases: _phrases
       }] // add your own speech context for better recognition
  },
  singleUtterance: true,
  interimResults: true, // If you want interim results, set this to true
  // silenceThreshold : 1700
};


// tts
let ttsClient, requestTTS;
    ttsClient = new textToSpeech.TextToSpeechClient();
    requestTTS = {
        "audioConfig": {
          "audioEncoding": "MP3",
          "pitch": 0,
          "speakingRate": 1
        },
        "voice": {
          "languageCode": "es-US",
          "name": "es-US-Wavenet-B"
        }
      }   

// =========================== START SERVER ================================ //

server.listen(port, function () {
  //http listen, to make socket work
  // app.address = "127.0.0.1";
  console.log('Server started on port:' + port);
});




 

      