/*!
 * numeral.js language configuration
 * language : czech (cs)
 * author : Anatoli Papirovski : https://github.com/apapirovski
 */
(function(){var n={delimiters:{thousands:" ",decimal:","},abbreviations:{thousand:"tis.",million:"mil.",billion:"b",trillion:"t"},ordinal:function(){return"."},currency:{symbol:"Kč"}};"undefined"!=typeof module&&module.exports&&(module.exports=n),"undefined"!=typeof window&&this.numeral&&this.numeral.language&&this.numeral.language("cs",n)})();