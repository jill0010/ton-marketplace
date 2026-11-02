import "@acton/fmt"
import "@acton/testing/expect"

get fun `test Desk Calendar official NFT address derivation`() {
    val code = parseCellFromHex("b5ee9c72010101010023000842022498bd63f3e9cc2c20c79abe58899a4816ea156855b8d4fcd47cda4bae9e911a");
    expect(code.hash()).toEqual(0x8b711e6809672c0335dc61d1da1dcc4059c973248af707bd586245085ea70b32);

    val config = beginCell()
        .storeUint(58002808596293429813852445390486946707098687748635984871519305117335532662285, 256)
        .storeAddress(parseAddress("0:4c71f300665314af55b75fc91d130ddf24c5006961f8f9772613947945f14863"))
        .endCell();

    val data = beginCell()
        .storeRef(config)
        .storeUint(0, 1)
        .endCell();

    val stateInit: ContractState = {
        code: code,
        data: data,
    };

    val calculated = AutoDeployAddress {
        workchain: 0,
        stateInit: stateInit,
    }.calculateAddress();

    expect(calculated).toEqual(
        parseAddress("0:ca0cfd519f763102b5bec9d9e3af43592ea362fb773fa319ea09c4f162c171e0")
    );
}

get fun `test peppermint official NFT address derivation`() {
    val code = parseCellFromHex("b5ee9c720101010100230008420291d9e2ac169fc785ce00de0a81af27622b9b7d1764415c775e7e50c03ce98aa2");
    expect(code.hash()).toEqual(0x30dcd7d5b6fcf5968c2791e1e31ad732f2672f2986e1d6970eb03cca22d23251);

    val config = beginCell()
        .storeUint(114897799376610330773365133023867860304942222743802619477429225476603721564700, 256)
        .storeAddress(parseAddress("0:035d180aa6918b9f3d9756dea7d599cb908290e18fee14cd4b0788dc2b60ced7"))
        .endCell();

    val data = beginCell()
        .storeRef(config)
        .storeUint(0, 1)
        .endCell();

    val stateInit: ContractState = {
        code: code,
        data: data,
    };

    val calculated = AutoDeployAddress {
        workchain: 0,
        stateInit: stateInit,
    }.calculateAddress();

    expect(calculated).toEqual(
        parseAddress("0:987acd6ac33180a35488ef924658c832ea5804294ea3bff55a33b171244dd0ac")
    );
}
