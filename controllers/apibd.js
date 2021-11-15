let Sequelize = require('sequelize');
let config = require('../config');

let sequelize = new Sequelize(config.database, config.username, config.password, config.sequelizeOption);

const getAudioResource = function (data) {	
    const textSearch = data.text.replace(/ /g,'');
    const idSede = data.idsede;    
    // if ( idSede ) {
        const read_query = `select nomfile from audio where text='${textSearch.toLowerCase()}' and estado='0'`;    
    // }
    return emitirRespuesta(read_query); 
}
module.exports.getAudioResource = getAudioResource;

const insertAudioResource = function (data) {	
    const textSearch = data.text.replace(/ /g,'');        
    const read_query = `insert into audio (nomfile, comando, idsede, idcomando, fecha, text) 
                            values ('${data.nomfile}', '${data.comando}', ${data.idsede}, ${data.idcomando_voz}, now(), '${textSearch.toLowerCase()}')`;    
    
    emitirRespuesta(read_query); 
}
module.exports.insertAudioResource = insertAudioResource;


function emitirRespuesta(xquery, res) {
	console.log(xquery);
	return sequelize.query(xquery, {type: sequelize.QueryTypes.SELECT})
	.then(function (rows) {
		return rows;
	})
	.catch((err) => {
		return err;
	});
}
